/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under AGPL-3.0 — see LICENSE file for details.
 */

import { z } from "zod";

/**
 * Zod schemas for MCP tool input validation.
 * Passed directly to MCP SDK as inputSchema — SDK detects Zod v4 via ._zod property.
 * Also used in tool handlers for runtime parsing via .parse(args).
 */

export const GetMyCoursesSchema = z.object({
  activeOnly: z.boolean().default(true).describe("Only return currently active courses"),
});

export const GetUpcomingDueDatesSchema = z.object({
  daysAhead: z.coerce.number().int().min(1).max(90).default(7).describe("Number of days ahead to look for due dates"),
  courseId: z.coerce.number().int().positive().optional().describe("Filter to a specific course ID"),
});

export const GetMyGradesSchema = z.object({
  courseId: z.coerce.number().int().positive().optional().describe("Course ID to get grades for. If omitted, returns grades for all enrolled courses."),
});

export const GetAnnouncementsSchema = z.object({
  courseId: z.coerce.number().int().positive().optional().describe("Course ID to get announcements for. If omitted, returns recent announcements across all courses."),
  count: z.coerce.number().int().min(1).max(50).default(10).describe("Maximum number of announcements to return"),
});

export const GetAssignmentsSchema = z.object({
  courseId: z.coerce.number().int().positive().optional()
    .describe("Course ID to get assignments for. If omitted, returns assignments for all enrolled courses."),
});

export const GetCourseContentSchema = z.object({
  courseId: z.coerce.number().int().positive()
    .describe("Course ID to get content tree for."),
  typeFilter: z.enum(["file", "link", "html", "video", "all"]).default("all").optional()
    .describe("Optional filter to narrow results by content type."),
  moduleTitle: z.string().optional()
    .describe("Case-insensitive substring match on module titles. Only returns modules whose title contains this string (e.g. 'Labs', 'Staff', 'Homeworks'). Children of matching modules are included in full."),
  maxDepth: z.coerce.number().int().min(1).max(10).optional()
    .describe("Limit recursive depth of the content tree. Depth 1 returns top-level modules with direct children only. Useful for getting a table of contents without all nested content."),
});

export const GetClasslistEmailsSchema = z.object({
  courseId: z.coerce.number().int().positive()
    .describe("Course ID to get emails for."),
});

export const DownloadFileSchema = z.object({
  courseId: z.coerce.number().int().positive()
    .describe("Course ID the file belongs to."),
  topicId: z.coerce.number().int().positive().optional()
    .describe("Content topic ID to download (for course content files)."),
  folderId: z.coerce.number().int().positive().optional()
    .describe("Dropbox folder ID (for submission/feedback file downloads)."),
  fileId: z.coerce.number().int().positive().optional()
    .describe("Specific file ID within a dropbox submission."),
  downloadPath: z.string().min(1)
    .describe("Absolute path to the directory where the file should be saved."),
  customFilename: z.string().optional()
    .describe("Custom filename for the downloaded file (include extension). If not provided, uses the original filename from Brightspace."),
});

export const GetSyllabusSchema = z.object({
  courseId: z.coerce.number().int().positive()
    .describe("Course ID to get syllabus for."),
  downloadPath: z.string().min(1).optional()
    .describe("Absolute path to the directory where the attachment should be saved."),
});

export const GetDiscussionsSchema = z.object({
  courseId: z.coerce.number().int().positive()
    .describe("Course ID to get discussion boards for."),
  forumId: z.coerce.number().int().positive().optional()
    .describe("Specific forum ID to get topics and posts for. If omitted, returns all forums."),
  topicId: z.coerce.number().int().positive().optional()
    .describe("Specific topic ID to get posts for. Requires forumId."),
});

export const GetRosterSchema = z.object({
  courseId: z.coerce.number().int().positive()
    .describe("Course ID to get roster for."),
  includeStudents: z.boolean().default(false)
    .describe("Include students in results. Default is instructors and TAs only."),
  searchTerm: z.string().optional()
    .describe("Optional search term to filter by name."),
});

// ── Lecturer / Dropbox tools ──────────────────────────────────────────────────

export const GetDropboxFoldersSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID to list dropbox (assignment) folders for."),
});

export const GetDropboxSubmissionsSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID."),
  folderId: z.coerce.number().int().positive()
    .describe("Dropbox folder ID to list submissions for."),
  activeOnly: z.boolean().default(true)
    .describe("When true, skip submissions that have already been fully graded (feedback published with a score)."),
  ignoreFeedback: z.boolean().default(false)
    .describe("When true, omit feedback status from each submission entry to reduce response size."),
});

export const GetDropboxUserSubmissionsSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID."),
  folderId: z.coerce.number().int().positive()
    .describe("Dropbox folder ID."),
  userId: z.coerce.number().int().positive()
    .describe("Brightspace user ID whose submissions to retrieve."),
  ignoreFeedback: z.boolean().default(false)
    .describe("When true, omit feedback status from the response."),
});

export const DownloadDropboxSubmissionFileSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID."),
  folderId: z.coerce.number().int().positive()
    .describe("Dropbox folder ID."),
  submissionId: z.coerce.number().int().positive()
    .describe("Submission ID (from get_dropbox_submissions or get_dropbox_user_submissions)."),
  fileId: z.coerce.number().int().positive()
    .describe("File ID within the submission."),
  downloadPath: z.string().min(1)
    .describe("Absolute path to the local directory where the file should be saved."),
  customFilename: z.string().optional()
    .describe("Override filename. If omitted the original submission filename is used."),
});

export const GetDropboxFeedbackSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID."),
  folderId: z.coerce.number().int().positive()
    .describe("Dropbox folder ID."),
  entityType: z.enum(["user", "group"])
    .describe("Whether to fetch feedback for an individual user or a group."),
  entityId: z.coerce.number().int().positive()
    .describe("User ID or group ID whose feedback to retrieve."),
});

export const GetRubricsForObjectSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID."),
  folderId: z.coerce.number().int().positive()
    .describe("Dropbox folder ID whose rubric(s) to retrieve."),
});

export const PostDropboxFeedbackSchema = z.object({
  orgUnitId: z.coerce.number().int().positive()
    .describe("Course / org-unit ID."),
  folderId: z.coerce.number().int().positive()
    .describe("Dropbox folder ID."),
  entityType: z.enum(["user", "group"])
    .describe("Whether to post feedback for an individual user or a group."),
  entityId: z.coerce.number().int().positive()
    .describe("User ID or group ID to post feedback for."),
  feedbackText: z.string().optional()
    .describe("Plain-text feedback comment. Provide feedbackText or feedbackHtml (or both)."),
  feedbackHtml: z.string().optional()
    .describe("HTML-formatted feedback comment. If both feedbackText and feedbackHtml are provided, feedbackHtml takes precedence for the API body."),
  score: z.coerce.number().min(0).optional()
    .describe("Numeric score to assign. Must not exceed the folder's ScoreDenominator."),
  isGraded: z.boolean().default(false)
    .describe("If true, mark the submission as graded (publishes the grade). Defaults to false (saves as draft only)."),
  rubricAssessments: z.array(z.object({
    rubricId: z.coerce.number().int().positive().describe("Rubric ID."),
    criteria: z.array(z.object({
      criterionId: z.coerce.number().int().positive().describe("Criterion ID."),
      levelId: z.coerce.number().int().positive().describe("Selected level ID."),
    })).describe("Criterion-level selections for the rubric."),
  })).optional()
    .describe("Optional rubric assessment selections. Use get_rubrics_for_object to discover rubric/criterion/level IDs."),
  confirmPost: z.boolean().default(false)
    .describe("REQUIRED SAFETY GATE: Must be explicitly set to true to post/save feedback. If false or omitted, the tool returns a preview without posting anything."),
});
