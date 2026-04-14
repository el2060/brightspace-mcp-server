/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient } from "../api/index.js";
import { PostDropboxFeedbackSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { log } from "../utils/logger.js";

// D2L Feedback POST body shape
interface D2LFeedbackBody {
  Score: number | null;
  Feedback: { Text: string; Html: string } | null;
  IsGraded: boolean;
  RubricAssessments?: D2LRubricAssessmentBody[];
}

interface D2LRubricAssessmentBody {
  RubricId: number;
  Criteria: Array<{
    CriterionId: number;
    LevelId: number;
  }>;
}

/** Escape HTML special characters in plain text for safe inclusion in HTML */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Register post_dropbox_feedback tool
 */
export function registerPostDropboxFeedback(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "post_dropbox_feedback",
    {
      title: "Post Dropbox Feedback",
      description:
        "Save or publish feedback for a student or group submission in a dropbox folder. " +
        "By default (isGraded=false) feedback is saved as a DRAFT and is NOT visible to the student. " +
        "Set isGraded=true ONLY when you intend to publish the grade. " +
        "SAFETY GATE: You MUST set confirmPost=true to actually post anything. " +
        "If confirmPost is false or omitted, the tool returns a preview of what would be posted " +
        "without making any changes to Brightspace. " +
        "Use get_rubrics_for_object to discover rubricId/criterionId/levelId values.",
      inputSchema: PostDropboxFeedbackSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "post_dropbox_feedback tool called", { args });

        const {
          orgUnitId,
          folderId,
          entityType,
          entityId,
          feedbackText,
          feedbackHtml,
          score,
          isGraded,
          rubricAssessments,
          confirmPost,
        } = PostDropboxFeedbackSchema.parse(args);

        // Require at least some feedback content
        if (!feedbackText && !feedbackHtml && score === undefined && !rubricAssessments?.length) {
          return errorResponse(
            "You must provide at least one of: feedbackText, feedbackHtml, score, or rubricAssessments."
          );
        }

        // Build the preview/body
        const effectiveHtml =
          feedbackHtml ?? (feedbackText ? `<p>${escapeHtml(feedbackText)}</p>` : null);
        const effectiveText = feedbackText ?? (feedbackHtml ? "(see HTML)" : null);

        const feedbackBody: D2LFeedbackBody = {
          Score: score !== undefined ? score : null,
          Feedback:
            effectiveText || effectiveHtml
              ? {
                  Text: effectiveText ?? "",
                  Html: effectiveHtml ?? "",
                }
              : null,
          IsGraded: isGraded,
          RubricAssessments: rubricAssessments?.map((ra) => ({
            RubricId: ra.rubricId,
            Criteria: ra.criteria.map((c) => ({
              CriterionId: c.criterionId,
              LevelId: c.levelId,
            })),
          })),
        };

        // Safety gate: preview mode when confirmPost is false
        if (!confirmPost) {
          log("INFO", "post_dropbox_feedback: confirmPost=false, returning preview");
          return toolResponse({
            mode: "preview",
            message:
              "No changes made to Brightspace. Set confirmPost=true to actually post this feedback.",
            wouldPost: {
              orgUnitId,
              folderId,
              entityType,
              entityId,
              isGraded,
              score: feedbackBody.Score,
              feedbackText: effectiveText,
              rubricAssessments: feedbackBody.RubricAssessments ?? [],
            },
          });
        }

        // Post feedback
        const feedbackPath = apiClient.le(
          orgUnitId,
          `/dropbox/folders/${folderId}/feedback/${entityType}/${entityId}`
        );

        try {
          await apiClient.post(feedbackPath, feedbackBody);
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse(
              "Access denied. You may not have instructor or TA permissions to post feedback."
            );
          }
          if (error?.status === 404) {
            return errorResponse(
              `Dropbox folder ${folderId} or ${entityType} ${entityId} not found in org unit ${orgUnitId}.`
            );
          }
          if (error?.status === 400) {
            return errorResponse(
              "Invalid feedback payload. Check that score does not exceed the folder's max score " +
                "and that rubric IDs/criterion IDs/level IDs are correct."
            );
          }
          throw error;
        }

        const published = isGraded ? "published (visible to student)" : "saved as draft (not yet visible to student)";

        log(
          "INFO",
          `post_dropbox_feedback: feedback ${published} for ${entityType} ${entityId} in folder ${folderId}`
        );

        return toolResponse({
          mode: "posted",
          success: true,
          message: `Feedback successfully ${published}.`,
          posted: {
            orgUnitId,
            folderId,
            entityType,
            entityId,
            isGraded,
            score: feedbackBody.Score,
            feedbackText: effectiveText,
          },
        });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
