/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient, DEFAULT_CACHE_TTLS } from "../api/index.js";
import { GetDropboxFoldersSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { log } from "../utils/logger.js";

// D2L Dropbox folder API types
interface D2LDropboxFolder {
  Id: number;
  CategoryId: number | null;
  Name: string;
  CustomInstructions: { Text: string; Html: string } | null;
  StartDate: string | null;
  EndDate: string | null;
  DueDate: string | null;
  IsHidden: boolean;
  GroupTypeId: number | null;
  SubmissionType: number | null;
  CompletionType: number | null;
  Assessment: {
    ScoreDenominator: number | null;
    Rubrics: Array<{ RubricId: number; Name: string }> | null;
  } | null;
}

/** Map SubmissionType integer to a readable label */
function submissionTypeLabel(t: number | null): string {
  switch (t) {
    case 0: return "file";
    case 1: return "text";
    case 2: return "on_paper";
    case 3: return "observed_in_person";
    default: return "unknown";
  }
}

/**
 * Register get_dropbox_folders tool
 */
export function registerGetDropboxFolders(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "get_dropbox_folders",
    {
      title: "Get Dropbox Folders",
      description:
        "List all assignment/dropbox folders for a course. Returns folder ID, name, due date, " +
        "start/end dates, submission type, visibility, and whether rubrics are attached. " +
        "Use this as a lecturer to discover what assignments exist before listing submissions. " +
        "Requires instructor or TA access to the org unit.",
      inputSchema: GetDropboxFoldersSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "get_dropbox_folders tool called", { args });

        const { orgUnitId } = GetDropboxFoldersSchema.parse(args);

        const apiPath = apiClient.le(orgUnitId, "/dropbox/folders/");

        let rawFolders: D2LDropboxFolder[];
        try {
          const response = await apiClient.get<
            { Objects: D2LDropboxFolder[] } | D2LDropboxFolder[]
          >(apiPath, { ttl: DEFAULT_CACHE_TTLS.assignments });

          rawFolders = Array.isArray(response)
            ? response
            : (response as any).Objects ?? [];
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse(
              "Access denied. You may not have instructor or TA permissions for this org unit."
            );
          }
          if (error?.status === 404) {
            return errorResponse(
              "Org unit not found. Check that the orgUnitId is correct."
            );
          }
          throw error;
        }

        if (rawFolders.length === 0) {
          return toolResponse({ orgUnitId, folders: [], message: "No dropbox folders found for this org unit." });
        }

        const folders = rawFolders.map((f) => ({
          folderId: f.Id,
          name: f.Name,
          categoryId: f.CategoryId,
          isHidden: f.IsHidden,
          isGroup: f.GroupTypeId !== null,
          submissionType: submissionTypeLabel(f.SubmissionType),
          dueDate: f.DueDate ?? null,
          startDate: f.StartDate ?? null,
          endDate: f.EndDate ?? null,
          maxScore: f.Assessment?.ScoreDenominator ?? null,
          rubrics: f.Assessment?.Rubrics?.map((r) => ({
            rubricId: r.RubricId,
            name: r.Name,
          })) ?? [],
          hasRubrics: (f.Assessment?.Rubrics?.length ?? 0) > 0,
        }));

        log("INFO", `get_dropbox_folders: ${folders.length} folders for orgUnit ${orgUnitId}`);
        return toolResponse({ orgUnitId, folders });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
