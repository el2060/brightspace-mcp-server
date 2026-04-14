/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient, DEFAULT_CACHE_TTLS } from "../api/index.js";
import { GetDropboxSubmissionsSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { log } from "../utils/logger.js";

// D2L submission API types (instructor view)
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

interface D2LDropboxFolder {
  Id: number;
  Name: string;
  DueDate: string | null;
  Assessment: { ScoreDenominator: number | null } | null;
}

/**
 * Register get_dropbox_submissions tool
 */
export function registerGetDropboxSubmissions(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "get_dropbox_submissions",
    {
      title: "Get Dropbox Submissions",
      description:
        "List all student/group submissions for a dropbox folder. " +
        "Returns submitter names, submission dates, late status, file lists, " +
        "feedback status, and score/graded state. " +
        "Requires instructor or TA access. " +
        "Use get_dropbox_folders first to find folder IDs.",
      inputSchema: GetDropboxSubmissionsSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "get_dropbox_submissions tool called", { args });

        const { orgUnitId, folderId, activeOnly, ignoreFeedback } =
          GetDropboxSubmissionsSchema.parse(args);

        // Fetch folder metadata and submissions in parallel
        const folderPath = apiClient.le(orgUnitId, "/dropbox/folders/");
        const submissionsPath = apiClient.le(
          orgUnitId,
          `/dropbox/folders/${folderId}/submissions/`
        );

        let rawSubmissions: D2LSubmission[];
        let folder: D2LDropboxFolder | null = null;

        try {
          const [foldersRaw, submissionsRaw] = await Promise.all([
            apiClient.get<{ Objects: D2LDropboxFolder[] } | D2LDropboxFolder[]>(
              folderPath,
              { ttl: DEFAULT_CACHE_TTLS.assignments }
            ),
            apiClient.get<{ Objects: D2LSubmission[] } | D2LSubmission[]>(
              submissionsPath
            ),
          ]);

          const allFolders = Array.isArray(foldersRaw)
            ? foldersRaw
            : (foldersRaw as any).Objects ?? [];
          folder = allFolders.find((f: D2LDropboxFolder) => f.Id === folderId) ?? null;

          rawSubmissions = Array.isArray(submissionsRaw)
            ? submissionsRaw
            : (submissionsRaw as any).Objects ?? [];
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse(
              "Access denied. You may not have instructor or TA permissions for this org unit."
            );
          }
          if (error?.status === 404) {
            return errorResponse(
              `Dropbox folder ${folderId} not found in org unit ${orgUnitId}.`
            );
          }
          throw error;
        }

        if (rawSubmissions.length === 0) {
          return toolResponse({
            orgUnitId,
            folderId,
            folderName: folder?.Name ?? null,
            dueDate: folder?.DueDate ?? null,
            submissions: [],
            message: "No submissions found for this dropbox folder.",
          });
        }

        // Optionally fetch feedback for all submitters
        const feedbackMap = new Map<string, D2LFeedback>();
        if (!ignoreFeedback) {
          await Promise.allSettled(
            rawSubmissions.map(async (sub) => {
              try {
                const userId = sub.SubmittedBy.Identifier;
                const feedbackPath = apiClient.le(
                  orgUnitId,
                  `/dropbox/folders/${folderId}/feedback/user/${userId}`
                );
                const fb = await apiClient.get<D2LFeedback>(feedbackPath);
                feedbackMap.set(userId, fb);
              } catch {
                // No feedback yet — silently skip
              }
            })
          );
        }

        const dueDate = folder?.DueDate ? new Date(folder.DueDate) : null;
        const maxScore = folder?.Assessment?.ScoreDenominator ?? null;

        const submissions = rawSubmissions.map((sub) => {
          const userId = sub.SubmittedBy.Identifier;
          const submittedAt = new Date(sub.SubmissionDate);
          const isLate = dueDate !== null && submittedAt > dueDate;
          const feedback = feedbackMap.get(userId) ?? null;

          const entry: Record<string, unknown> = {
            submissionId: sub.Id,
            userId,
            displayName: sub.SubmittedBy.DisplayName,
            submittedDate: sub.SubmissionDate,
            isLate,
            files: sub.Files.map((f) => ({
              fileId: f.FileId,
              name: f.FileName,
              size: f.Size,
            })),
            comment: sub.Comment?.Text ?? null,
          };

          if (!ignoreFeedback) {
            entry.feedbackStatus = feedback
              ? {
                  isGraded: feedback.IsGraded,
                  score: feedback.Score,
                  maxScore,
                  hasFeedbackText: !!feedback.Feedback?.Text,
                }
              : { isGraded: false, score: null, maxScore, hasFeedbackText: false };
          }

          return entry;
        });

        // Apply activeOnly filter — exclude fully graded submissions
        const filtered =
          activeOnly && !ignoreFeedback
            ? submissions.filter((s) => {
                const fb = s.feedbackStatus as any;
                return !fb?.isGraded;
              })
            : submissions;

        log(
          "INFO",
          `get_dropbox_submissions: ${filtered.length} submissions (of ${rawSubmissions.length} total) for folder ${folderId}`
        );

        return toolResponse({
          orgUnitId,
          folderId,
          folderName: folder?.Name ?? null,
          dueDate: folder?.DueDate ?? null,
          maxScore,
          totalSubmissions: rawSubmissions.length,
          returnedSubmissions: filtered.length,
          activeOnly,
          submissions: filtered,
        });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
