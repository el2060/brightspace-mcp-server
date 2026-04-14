/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under AGPL-3.0 — see LICENSE file for details.
 */

// Tool registration functions - barrel export
export { registerGetMyCourses } from "./get-my-courses.js";
export { registerGetUpcomingDueDates } from "./get-upcoming-due-dates.js";
export { registerGetMyGrades } from "./get-my-grades.js";
export { registerGetAnnouncements } from "./get-announcements.js";
export { registerGetAssignments } from "./get-assignments.js";
export { registerGetCourseContent } from "./get-course-content.js";
export { registerDownloadFile } from "./download-file.js";
export { registerGetClasslistEmails } from "./get-classlist-emails.js";
export { registerGetRoster } from "./get-roster.js";
export { registerGetSyllabus } from "./get-syllabus.js";
export { registerGetDiscussions } from "./get-discussions.js";

// OAL design review tool
export { registerReviewModuleAgainstOal } from "./review-module-against-oal.js";

// Lecturer / Dropbox tools
export { registerGetDropboxFolders } from "./get-dropbox-folders.js";
export { registerGetDropboxSubmissions } from "./get-dropbox-submissions.js";
export { registerGetDropboxUserSubmissions } from "./get-dropbox-user-submissions.js";
export { registerDownloadDropboxSubmissionFile } from "./download-dropbox-submission-file.js";
export { registerGetDropboxFeedback } from "./get-dropbox-feedback.js";
export { registerGetRubricsForObject } from "./get-rubrics-for-object.js";
export { registerPostDropboxFeedback } from "./post-dropbox-feedback.js";

// Re-export shared helpers and schemas for convenience
export { toolResponse, errorResponse, sanitizeError } from "./tool-helpers.js";
export * from "./schemas.js";
