# Brightspace MCP Server — NP Fork

> **A fork of [RohanMuppa/brightspace-mcp-server](https://github.com/RohanMuppa/brightspace-mcp-server), adapted for Ngee Ann Polytechnic**

Connect your AI assistant to Brightspace at Ngee Ann Polytechnic. Ask about course content, announcements, assignments, due dates, class lists, syllabus, and discussions — right from your AI coding environment.

This is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects an AI client to the NP Brightspace instance (`nplms.polite.edu.sg`) via D2L's web interface. It is designed for **NP lecturers and instructional staff** who want to use AI tools for course support, content retrieval, and workflow assistance.

<p align="center">
  <img src="https://raw.githubusercontent.com/RohanMuppa/brightspace-mcp-server/main/docs/how-it-works.svg" alt="Architecture diagram" width="100%">
</p>

---

## About This Fork

This fork is maintained separately from the upstream repository to target the NP Brightspace environment and lecturer-focused workflows. It is intended to support:

- **Course content retrieval** — slides, PDFs, module content, and syllabuses
- **Announcements** — retrieve and summarise lecturer announcements
- **Assignments and due dates** — list upcoming deadlines across all courses
- **Class lists** — access student enrolment information per course
- **Discussions** — read and summarise discussion threads where available

**Planned / future work** (not yet implemented):

- Assignment dropbox review and submission summaries
- Rubric-guided feedback drafting
- Automated progress tracking per student or cohort

If a feature is listed as planned, it is not yet functional. Do not rely on it in production workflows.

---

## NP Setup

### Prerequisites

- [Node.js 18+](https://nodejs.org/) — download the LTS version
- Access to [nplms.polite.edu.sg](https://nplms.polite.edu.sg) with your NP staff account
- Microsoft SSO login with Duo MFA (required during the auth step — keep Duo ready)

### Step 1 — Run the setup wizard

```bash
npx brightspace-mcp-server setup
```

When prompted for your school URL, enter:

```
https://nplms.polite.edu.sg
```

The wizard will open a browser window. **Sign in with your NP Microsoft SSO credentials and approve the Duo push when prompted.** Do not close the browser until the wizard completes.

After setup, credentials are saved to `~/.brightspace-mcp/config.json` on your machine.

### Step 2 — Configure VS Code Copilot Agent mode (recommended)

This fork is optimised for use with **VS Code Copilot in Agent mode** via a local stdio MCP server.

Add the following to your VS Code `settings.json` (or your workspace `.vscode/mcp.json`):

```json
{
  "mcp": {
    "servers": {
      "brightspace-np": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "brightspace-mcp-server@latest"]
      }
    }
  }
}
```

On **Windows**, wrap the command:

```json
{
  "mcp": {
    "servers": {
      "brightspace-np": {
        "type": "stdio",
        "command": "cmd",
        "args": ["/c", "npx", "-y", "brightspace-mcp-server@latest"]
      }
    }
  }
}
```

Restart VS Code after saving. Copilot Agent mode will now have access to your NP Brightspace data.

### Step 3 — Other AI clients

The server works with any MCP-compatible client (Claude Desktop, Cursor, Windsurf, etc.). Register the server command:

```
npx -y brightspace-mcp-server@latest
```

Search your client's documentation for how to add an MCP server via stdio.

---

## Session Expired?

Sessions re-authenticate automatically. If auto-reauth fails (e.g., you missed the Duo push on your phone):

```bash
npx brightspace-mcp-server auth
```

A browser window will open. Sign in with Microsoft SSO and approve the Duo prompt.

---

## What You Can Ask About

| Topic | Examples |
|-------|---------|
| Announcements | "What announcements have I posted this week?" · "Summarise all announcements across my courses" |
| Assignments | "What assignments are due in the next two weeks?" · "List all unsubmitted assignments for IT1234" |
| Course content | "Find the Week 3 lecture slides for my networking module" · "List all PDFs uploaded to Module 2" |
| Class lists | "Who is enrolled in my IT2001 class?" · "Get the student list for all my courses this semester" |
| Syllabus | "What are the learning outcomes for this module?" · "Summarise the assessment breakdown for IT3001" |
| Discussions | "What are students saying in the project discussion thread?" · "Summarise the latest posts in the Week 5 discussion" |
| Due dates | "Give me a timeline of all upcoming deadlines across my courses" |

---

## Example Prompts

The following are practical prompts for NP lecturers using this server in VS Code Copilot Agent mode:

```
List all the announcements I've made across my courses this semester.
```

```
What assignments are due in my IT2001 course in the next two weeks?
```

```
Summarise the discussion posts in the Week 4 forum for IT3456.
```

```
What course content files are available in Module 3 of my networking module?
```

```
Who is currently enrolled in my Tuesday afternoon IT1234 class?
```

```
What are the assessment components and weightings listed in the syllabus for IT2001?
```

---

## Lecturer Workflows

This server is designed to support the following lecturer and instructional workflows:

**Course preparation**
Use the AI to retrieve and review your own course content — slides, module pages, and syllabuses — so you can quickly reference materials without logging into the portal.

**Announcement drafting**
Retrieve past announcements for context, then use the AI to draft a new one in a consistent tone.

**Discussion monitoring**
Summarise student discussion threads to identify common questions or issues before a tutorial session.

**Due date planning**
Get an overview of all deadlines across your modules to spot clashes or plan assessment spacing.

**Future: Assignment review and feedback drafting** *(planned)*
Once dropbox review tools are implemented, you will be able to retrieve student submissions and use the AI to draft rubric-guided feedback. This is not yet available.

---

## Lecturer / Instructor Tools

Educators can use the following tools to review submissions, download student files, and draft rubric-based feedback — all without leaving VS Code Copilot Agent mode.

| Tool | What it does | Access |
|------|--------------|--------|
| `get_dropbox_folders` | List all assignment folders for a course with due dates, submission types, and rubric info | Read-only |
| `get_dropbox_submissions` | List all student submissions for a folder (name, date, files, late status, feedback state) | Read-only |
| `get_dropbox_user_submissions` | Retrieve one student's submissions and existing feedback | Read-only |
| `download_dropbox_submission_file` | Download a submitted file to a local directory | Read-only |
| `get_dropbox_feedback` | View existing feedback/score/rubric assessment for a student | Read-only |
| `get_rubrics_for_object` | Fetch rubric criteria, levels, and point values for an assignment | Read-only |
| `post_dropbox_feedback` | Save draft feedback or publish a grade (**requires `confirmPost=true`**) | Write |

### Example prompts

```
"List submissions for Assignment 2"
"Download Jane Tan's latest submission for the final project"
"Review this submission against my rubric and suggest a grade"
"Show existing feedback for student 12345"
"Save this as draft feedback with a score of 88"
```

### Safety notes

- `post_dropbox_feedback` defaults to **draft mode** (`isGraded=false`) so grades are never auto-published.
- Nothing is written to Brightspace unless you pass `confirmPost: true`.
- Set `isGraded: true` only when you intend to publish the grade and make it visible to students.

## Troubleshooting

**"Not authenticated"** → Run `npx brightspace-mcp-server auth` and complete the Microsoft SSO + Duo flow

**AI client not responding** → Quit and reopen the client completely (not just close the window)

**Need to redo setup** → Run `npx brightspace-mcp-server setup` again and re-enter `https://nplms.polite.edu.sg`

**Config location** → `~/.brightspace-mcp/config.json` (you can edit this directly)

**Browser launch times out (Windows)** → Open Task Manager, end all Chromium/Chrome processes, and try again. If it persists, add the Playwright Chromium folder to your antivirus exclusion list.

**Auth fails in WSL or Docker** → Chromium dependencies may be missing. Run `npx playwright install-deps chromium` to install them. The server automatically adds `--no-sandbox` for these environments.

**Headless login fails (Windows)** → SSO login flows can fail in headless mode on Windows. The default is headed (a browser window opens). If you set `D2L_HEADLESS=true` and auth fails, switch back to headed mode.

**Auth hangs or browser won't open**

Delete stale session files and retry:

```bash
rm -rf ~/.d2l-session/session.json ~/.d2l-session/storage-state.json ~/.d2l-session/browser-data/SingletonLock
npx brightspace-mcp-server auth
```

**Still running an old version after update**

npx caches packages locally. Clear the cache to force a fresh download:

```bash
npx clear-npx-cache
npx brightspace-mcp-server@latest
```

---

## Security

- Credentials stay on your machine at `~/.brightspace-mcp/config.json` (restricted permissions)
- Session tokens are encrypted (AES-256-GCM)
- All traffic to Brightspace is HTTPS
- Nothing is sent anywhere except `nplms.polite.edu.sg` and your Microsoft/Duo login pages

---

## Attribution

This repository is a fork of **[RohanMuppa/brightspace-mcp-server](https://github.com/RohanMuppa/brightspace-mcp-server)**, originally created by [Rohan Muppa](https://github.com/rohanmuppa). The core MCP server implementation, authentication flow, tool architecture, and npm package are his work. This fork adapts the project for use at Ngee Ann Polytechnic.

Upstream improvements and bug fixes should be credited to the original repository. If you find a bug that exists in the upstream project, consider opening a pull request there as well.

Licensed under the [MIT License](./LICENSE). Copyright 2026 Rohan Muppa.

---

[Report an issue (this fork)](https://github.com/el2060/brightspace-mcp-server/issues) · [Upstream repository](https://github.com/RohanMuppa/brightspace-mcp-server)
