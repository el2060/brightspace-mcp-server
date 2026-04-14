/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { D2LApiClient } from "../api/index.js";
import { DownloadDropboxSubmissionFileSchema } from "./schemas.js";
import { toolResponse, sanitizeError, errorResponse } from "./tool-helpers.js";
import { log } from "../utils/logger.js";
import {
  validateDownloadPath,
  validateFileType,
  MAX_FILE_SIZE,
} from "../utils/file-validator.js";
import { secureDownload } from "../utils/download-helpers.js";
import path from "node:path";
import fs from "node:fs/promises";

// D2L submission file types
interface D2LSubmissionFile {
  FileId: number;
  FileName: string;
  Size: number;
}

interface D2LSubmission {
  Id: number;
  Files: D2LSubmissionFile[];
}

/**
 * Register download_dropbox_submission_file tool
 */
export function registerDownloadDropboxSubmissionFile(
  server: McpServer,
  apiClient: D2LApiClient
): void {
  server.registerTool(
    "download_dropbox_submission_file",
    {
      title: "Download Dropbox Submission File",
      description:
        "Download a specific file from a student's dropbox submission to a local directory. " +
        "Use get_dropbox_submissions or get_dropbox_user_submissions to discover " +
        "submissionId and fileId values. " +
        "IMPORTANT: Ask the user where they want to save the file before calling this tool. " +
        "After identifying the file, suggest a clean readable filename and ask if they'd like to rename it.",
      inputSchema: DownloadDropboxSubmissionFileSchema,
    },
    async (args: any) => {
      try {
        log("DEBUG", "download_dropbox_submission_file tool called", { args });

        const { orgUnitId, folderId, submissionId, fileId, downloadPath, customFilename } =
          DownloadDropboxSubmissionFileSchema.parse(args);

        // Validate downloadPath
        if (!path.isAbsolute(downloadPath)) {
          return errorResponse(
            "downloadPath must be an absolute path (e.g., /Users/username/Downloads or C:\\Users\\username\\Downloads)"
          );
        }

        try {
          const stats = await fs.stat(downloadPath);
          if (!stats.isDirectory()) {
            return errorResponse(`downloadPath is not a directory: ${downloadPath}`);
          }
        } catch (error: any) {
          if (error?.code === "ENOENT") {
            return errorResponse(`Download directory does not exist: ${downloadPath}`);
          }
          throw error;
        }

        // Fetch submission metadata to get the file list and validate fileId
        const submissionsPath = apiClient.le(
          orgUnitId,
          `/dropbox/folders/${folderId}/submissions/`
        );

        let targetFile: D2LSubmissionFile | null = null;
        try {
          const raw = await apiClient.get<
            { Objects: D2LSubmission[] } | D2LSubmission[]
          >(submissionsPath);
          const allSubmissions: D2LSubmission[] = Array.isArray(raw)
            ? raw
            : (raw as any).Objects ?? [];

          const submission = allSubmissions.find((s) => s.Id === submissionId);
          if (!submission) {
            return errorResponse(
              `Submission ${submissionId} not found in folder ${folderId}. ` +
                "Use get_dropbox_submissions to list available submissions."
            );
          }
          targetFile = submission.Files.find((f) => f.FileId === fileId) ?? null;
          if (!targetFile) {
            const available = submission.Files.map(
              (f) => `${f.FileName} (ID: ${f.FileId})`
            ).join(", ");
            return errorResponse(
              `File ID ${fileId} not found in submission ${submissionId}. ` +
                `Available files: ${available}`
            );
          }
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse(
              "Access denied. You may not have instructor or TA permissions for this org unit."
            );
          }
          if (error?.status === 404) {
            return errorResponse(
              `Folder ${folderId} not found in org unit ${orgUnitId}.`
            );
          }
          throw error;
        }

        // Check size before downloading
        if (targetFile.Size > MAX_FILE_SIZE) {
          return errorResponse(
            `File too large (${Math.round(targetFile.Size / 1024 / 1024)}MB). ` +
              `Maximum allowed: ${MAX_FILE_SIZE / 1024 / 1024}MB`
          );
        }

        // Build download URL and fetch the file
        const downloadApiPath = apiClient.le(
          orgUnitId,
          `/dropbox/folders/${folderId}/submissions/${submissionId}/files/${fileId}/download`
        );

        let response: Response;
        try {
          response = await apiClient.getRaw(downloadApiPath);
        } catch (error: any) {
          if (error?.status === 403) {
            return errorResponse("Access denied when downloading the file.");
          }
          if (error?.status === 404) {
            return errorResponse("File not found on the server. It may have been deleted.");
          }
          throw error;
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length > MAX_FILE_SIZE) {
          return errorResponse(
            `File too large (${Math.round(buffer.length / 1024 / 1024)}MB). ` +
              `Maximum allowed: ${MAX_FILE_SIZE / 1024 / 1024}MB`
          );
        }

        const originalFilename = targetFile.FileName;
        const effectiveFilename = customFilename || originalFilename;

        const result = await secureDownload({
          targetDir: downloadPath,
          filename: effectiveFilename,
          data: buffer,
        });

        log(
          "INFO",
          `download_dropbox_submission_file: saved ${result.path} (${result.size} bytes, ${result.mime})`
        );

        return toolResponse({
          success: true,
          filePath: result.path,
          fileSize: result.size,
          mimeType: result.mime,
          originalFilename,
          message: `File downloaded successfully to ${result.path}`,
        });
      } catch (error) {
        return sanitizeError(error);
      }
    }
  );
}
