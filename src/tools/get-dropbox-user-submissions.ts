/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient } from "../api/index.js";
import { GetDropboxUserSubmissionsSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { log } from "../utils/logger.js";

// D2L API types
interface D2LSubmissionFile {
  FileId: number;
  FileName: string;
  Size: number;
}

interface D2LSubmission {
  Id: number;
  SubmittedBy: { Identifier: string; DisplayName: string };
  SubmissionDate: string;
  Comment: { Text: string; Html: string } | null;
  Files: D2LSubmissionFile[];
}

interface D2LFeedback {
  Score: number | null;
  Feedback: { Text: string; Html: string } | null;
  IsGraded: boolean;
}

/**
 * Register get_dropbox_user_submissions tool
 */
export function registerGetDropboxUserSubmissions(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "get_dropbox_user_submissions",
    {
      title: "Get Dropbox User Submissions",
      description:
        "Retrieve all submissions made by a specific user (or group) in a dropbox folder. " +
        "Useful for reviewing a single student's work before drafting feedback. " +
        "Requires instructor or TA access.",
      inputSchema: GetDropboxUserSubmissionsSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "get_dropbox_user_submissions tool called", { args });

        const { orgUnitId, folderId, userId, ignoreFeedback } =
          GetDropboxUserSubmissionsSchema.parse(args);

        const submissionsPath = apiClient.le(
          orgUnitId,
          `/dropbox/folders/${folderId}/submissions/users/${userId}`
        );

        let rawSubmissions: D2LSubmission[];
        try {
          const raw = await apiClient.get<
            { Objects: D2LSubmission[] } | D2LSubmission[]
          >(submissionsPath);
          rawSubmissions = Array.isArray(raw) ? raw : (raw as any).Objects ?? [];
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse(
              "Access denied. You may not have instructor or TA permissions for this org unit."
            );
          }
          if (error?.status === 404) {
            return errorResponse(
              `No submissions found for user ${userId} in dropbox folder ${folderId}. ` +
                "Check that the user has actually submitted."
            );
          }
          throw error;
        }

        if (rawSubmissions.length === 0) {
          return toolResponse({
            orgUnitId,
            folderId,
            userId,
            submissions: [],
            message: "No submissions found for this user in the specified folder.",
          });
        }

        // Optionally fetch feedback
        let feedback: D2LFeedback | null = null;
        if (!ignoreFeedback) {
          try {
            const feedbackPath = apiClient.le(
              orgUnitId,
              `/dropbox/folders/${folderId}/feedback/user/${userId}`
            );
            feedback = await apiClient.get<D2LFeedback>(feedbackPath);
          } catch {
            // No feedback yet — silently skip
          }
        }

        const submissions = rawSubmissions.map((sub) => ({
          submissionId: sub.Id,
          userId: sub.SubmittedBy.Identifier,
          displayName: sub.SubmittedBy.DisplayName,
          submittedDate: sub.SubmissionDate,
          files: sub.Files.map((f) => ({
            fileId: f.FileId,
            name: f.FileName,
            size: f.Size,
          })),
          comment: sub.Comment?.Text ?? null,
        }));

        const feedbackStatus = ignoreFeedback
          ? undefined
          : feedback
          ? {
              isGraded: feedback.IsGraded,
              score: feedback.Score,
              hasFeedbackText: !!feedback.Feedback?.Text,
              feedbackText: feedback.Feedback?.Text ?? null,
            }
          : { isGraded: false, score: null, hasFeedbackText: false, feedbackText: null };

        log(
          "INFO",
          `get_dropbox_user_submissions: ${submissions.length} submissions for user ${userId} in folder ${folderId}`
        );

        return toolResponse({
          orgUnitId,
          folderId,
          userId,
          submissions,
          feedbackStatus,
        });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
