/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient } from "../api/index.js";
import { GetDropboxFeedbackSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { convertHtmlToMarkdown } from "../utils/html-converter.js";
import { log } from "../utils/logger.js";

// D2L Feedback API types
interface D2LRubricCriterionCell {
  CriterionId: number;
  LevelId: number | null;
  Points: number | null;
  Comments: { Text: string; Html: string } | null;
}

interface D2LRubricAssessment {
  RubricId: number;
  Name: string;
  TotalPoints: number | null;
  Criteria: D2LRubricCriterionCell[];
}

interface D2LFeedback {
  Score: number | null;
  Feedback: { Text: string; Html: string } | null;
  IsGraded: boolean;
  RubricAssessments: D2LRubricAssessment[] | null;
}

/**
 * Register get_dropbox_feedback tool
 */
export function registerGetDropboxFeedback(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "get_dropbox_feedback",
    {
      title: "Get Dropbox Feedback",
      description:
        "Retrieve existing feedback for a specific user or group in a dropbox folder. " +
        "Returns score, graded state, feedback text, and rubric assessment details. " +
        "Use this before drafting new feedback to review what has already been saved. " +
        "Requires instructor or TA access.",
      inputSchema: GetDropboxFeedbackSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "get_dropbox_feedback tool called", { args });

        const { orgUnitId, folderId, entityType, entityId } =
          GetDropboxFeedbackSchema.parse(args);

        const feedbackPath = apiClient.le(
          orgUnitId,
          `/dropbox/folders/${folderId}/feedback/${entityType}/${entityId}`
        );

        let feedback: D2LFeedback;
        try {
          feedback = await apiClient.get<D2LFeedback>(feedbackPath);
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse(
              "Access denied. You may not have instructor or TA permissions for this org unit."
            );
          }
          if (error?.status === 404) {
            return toolResponse({
              orgUnitId,
              folderId,
              entityType,
              entityId,
              feedback: null,
              message: "No feedback found. This submission has not been graded yet.",
            });
          }
          throw error;
        }

        // Convert HTML feedback to markdown for LLM readability
        const feedbackMarkdown =
          feedback.Feedback?.Html
            ? convertHtmlToMarkdown(feedback.Feedback.Html)
            : null;

        const rubricAssessments =
          feedback.RubricAssessments?.map((ra) => ({
            rubricId: ra.RubricId,
            rubricName: ra.Name,
            totalPoints: ra.TotalPoints,
            criteria: ra.Criteria.map((c) => ({
              criterionId: c.CriterionId,
              selectedLevelId: c.LevelId,
              points: c.Points,
              comments: c.Comments?.Text ?? null,
            })),
          })) ?? [];

        log(
          "INFO",
          `get_dropbox_feedback: retrieved feedback for ${entityType} ${entityId} in folder ${folderId}`
        );

        return toolResponse({
          orgUnitId,
          folderId,
          entityType,
          entityId,
          feedback: {
            score: feedback.Score,
            isGraded: feedback.IsGraded,
            feedbackText: feedback.Feedback?.Text ?? null,
            feedbackMarkdown,
            rubricAssessments,
          },
        });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
