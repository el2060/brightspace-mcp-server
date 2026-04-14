/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient, DEFAULT_CACHE_TTLS } from "../api/index.js";
import { GetRubricsForObjectSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { log } from "../utils/logger.js";

// D2L Dropbox folder with full rubric details
interface D2LRubricLevel {
  LevelId: number;
  Name: string;
  Points: number;
  Description: { Text: string; Html: string } | null;
}

interface D2LRubricCriterion {
  CriterionId: number;
  Name: string;
  Levels: D2LRubricLevel[];
}

interface D2LRubricFull {
  RubricId: number;
  Name: string;
  Criteria: D2LRubricCriterion[];
}

interface D2LDropboxFolder {
  Id: number;
  Name: string;
  Assessment: {
    ScoreDenominator: number | null;
    Rubrics: D2LRubricFull[] | null;
  } | null;
}

/**
 * Register get_rubrics_for_object tool
 */
export function registerGetRubricsForObject(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "get_rubrics_for_object",
    {
      title: "Get Rubrics for Assignment",
      description:
        "Retrieve full rubric metadata (criteria, levels, and point values) attached to a dropbox folder. " +
        "Use this before calling post_dropbox_feedback to discover rubricId, criterionId, and levelId values " +
        "needed for rubric-based grading. Requires instructor or TA access.",
      inputSchema: GetRubricsForObjectSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "get_rubrics_for_object tool called", { args });

        const { orgUnitId, folderId } = GetRubricsForObjectSchema.parse(args);

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
            return errorResponse(`Org unit ${orgUnitId} not found.`);
          }
          throw error;
        }

        const folder = rawFolders.find((f) => f.Id === folderId);
        if (!folder) {
          return errorResponse(
            `Dropbox folder ${folderId} not found in org unit ${orgUnitId}.`
          );
        }

        const rubrics = folder.Assessment?.Rubrics;
        if (!rubrics || rubrics.length === 0) {
          return toolResponse({
            orgUnitId,
            folderId,
            folderName: folder.Name,
            rubrics: [],
            message: "No rubrics are attached to this dropbox folder.",
          });
        }

        const formattedRubrics = rubrics.map((r) => ({
          rubricId: r.RubricId,
          name: r.Name,
          criteria: (r.Criteria ?? []).map((c) => ({
            criterionId: c.CriterionId,
            name: c.Name,
            levels: (c.Levels ?? []).map((l) => ({
              levelId: l.LevelId,
              name: l.Name,
              points: l.Points,
              description: l.Description?.Text ?? null,
            })),
          })),
        }));

        log(
          "INFO",
          `get_rubrics_for_object: ${formattedRubrics.length} rubric(s) for folder ${folderId}`
        );

        return toolResponse({
          orgUnitId,
          folderId,
          folderName: folder.Name,
          maxScore: folder.Assessment?.ScoreDenominator ?? null,
          rubrics: formattedRubrics,
        });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
