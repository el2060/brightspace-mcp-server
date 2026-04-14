/**
 * Brightspace MCP Server — NP Fork
 * Copyright (c) 2026 el2060. All rights reserved.
 * Licensed under AGPL-3.0 — see LICENSE file for details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { ReviewModuleAgainstOalSchema } from "./schemas.js";
import { toolResponse, errorResponse, sanitizeError } from "./tool-helpers.js";
import type { AppConfig } from "../types/index.js";
import { log } from "../utils/logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentSection {
  heading: string | null;
  level: number;
  text: string;
  activityLinks: string[];
}

interface ModuleSummary {
  title: string;
  url: string;
  sections: ContentSection[];
}

interface OalCriteria {
  communication: string[];
  content: string[];
  collaboration: string[];
  practiceFeedback: string[];
  rawText: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build Chromium launch args suitable for the current platform / environment.
 * Mirrors the subset used by BrowserAuth so behaviour is consistent.
 */
function buildChromiumArgs(): string[] {
  const args = ["--disable-blink-features=AutomationControlled"];

  if (process.platform === "win32") {
    args.push("--disable-gpu");
  }

  // WSL / Docker require --no-sandbox (mirrors browser-auth.ts detection logic)
  let needsSandboxDisable = false;
  try {
    const v = fsSync.readFileSync("/proc/version", "utf-8");
    if (/microsoft|wsl/i.test(v)) needsSandboxDisable = true;
  } catch { /* not Linux */ }
  if (!needsSandboxDisable) {
    try {
      fsSync.accessSync("/.dockerenv");
      needsSandboxDisable = true;
    } catch { /* not Docker */ }
  }
  if (needsSandboxDisable) {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  return args;
}

/**
 * Extract a structured module summary from the current Brightspace page.
 * Uses broad selectors so it works across Brightspace's varying HTML templates.
 */
async function extractModuleSummary(page: Page, url: string): Promise<ModuleSummary> {
  const data = await page.evaluate(() => {
    // Page title — try D2L-specific selectors then fall back to <title>
    const titleEl =
      document.querySelector<HTMLElement>("h1.d2l-page-title") ??
      document.querySelector<HTMLElement>(".d2l-navigation-main-header h1") ??
      document.querySelector<HTMLElement>("h1");
    const title = titleEl?.innerText?.trim() ?? document.title ?? "Unknown";

    // Collect all headings and the text between them as "sections"
    const sections: Array<{
      heading: string | null;
      level: number;
      text: string;
      activityLinks: string[];
    }> = [];

    // Gather meaningful page text by walking important containers
    const mainContent =
      document.querySelector<HTMLElement>(".d2l-page-main-padded") ??
      document.querySelector<HTMLElement>("#d2l_page_main_content") ??
      document.querySelector<HTMLElement>(".d2l-course-home-widget-grid") ??
      document.querySelector<HTMLElement>("main") ??
      document.body;

    // Walk headings to create sections
    const headings = Array.from(
      mainContent.querySelectorAll<HTMLElement>("h1, h2, h3, h4")
    );

    if (headings.length === 0) {
      // No headings — return body text as a single section
      sections.push({
        heading: null,
        level: 0,
        text: (mainContent.innerText ?? "").slice(0, 4000).trim(),
        activityLinks: Array.from(mainContent.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .map((a) => a.innerText.trim())
          .filter((t) => t.length > 0)
          .slice(0, 30),
      });
    } else {
      for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        const nextH = headings[i + 1];

        // Collect sibling text nodes between this heading and the next
        const siblingTexts: string[] = [];
        const linkTexts: string[] = [];
        let node: Element | null = h.nextElementSibling;

        while (node && node !== nextH) {
          const el = node as HTMLElement;
          if (el.innerText) {
            siblingTexts.push(el.innerText.trim());
          }
          // Collect link labels as activity hints
          el.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
            const t = a.innerText.trim();
            if (t) linkTexts.push(t);
          });
          node = node.nextElementSibling;
        }

        sections.push({
          heading: h.innerText?.trim() ?? null,
          level: parseInt(h.tagName.replace("H", ""), 10),
          text: siblingTexts.join("\n").slice(0, 2000).trim(),
          activityLinks: linkTexts.slice(0, 20),
        });
      }
    }

    return { title, sections };
  });

  return { title: data.title, url, sections: data.sections };
}

/**
 * Extract OAL criteria text from the toolkit page.
 *
 * The function attempts to detect the four design areas by keyword matching on
 * headings and returns classified lists. When automatic classification fails the
 * full page text is still returned in `rawText` so the AI host can parse it.
 */
async function extractOalCriteria(page: Page): Promise<OalCriteria> {
  const raw = await page.evaluate(() => {
    const mainContent =
      document.querySelector<HTMLElement>(".d2l-page-main-padded") ??
      document.querySelector<HTMLElement>("#d2l_page_main_content") ??
      document.querySelector<HTMLElement>("main") ??
      document.body;

    // Collect all block-level text chunks with their heading labels
    const chunks: Array<{ heading: string; text: string }> = [];
    const headings = Array.from(
      mainContent.querySelectorAll<HTMLElement>("h1, h2, h3, h4")
    );

    if (headings.length === 0) {
      return { chunks: [], raw: (mainContent.innerText ?? "").slice(0, 8000).trim() };
    }

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const nextH = headings[i + 1];
      const texts: string[] = [];
      let node: Element | null = h.nextElementSibling;

      while (node && node !== nextH) {
        const t = (node as HTMLElement).innerText?.trim();
        if (t) texts.push(t);
        node = node.nextElementSibling;
      }

      chunks.push({
        heading: h.innerText?.trim() ?? "",
        text: texts.join("\n").trim(),
      });
    }

    return {
      chunks,
      raw: (mainContent.innerText ?? "").slice(0, 8000).trim(),
    };
  });

  // Keyword-based classification of the four OAL design areas
  const communication: string[] = [];
  const content: string[] = [];
  const collaboration: string[] = [];
  const practiceFeedback: string[] = [];

  for (const { heading, text } of raw.chunks) {
    const h = heading.toLowerCase();
    const lines = text.split(/\n+/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);

    if (/communicat/i.test(h)) {
      communication.push(...lines);
    } else if (/content|resource|material/i.test(h)) {
      content.push(...lines);
    } else if (/collaborat|social|peer/i.test(h)) {
      collaboration.push(...lines);
    } else if (/practice|feedback|assessment|activit/i.test(h)) {
      practiceFeedback.push(...lines);
    } else if (lines.length > 0) {
      // Unclassified sections — include under content as a safe default
      content.push(`[${heading}] ${lines.join(" | ")}`);
    }
  }

  return {
    communication,
    content,
    collaboration,
    practiceFeedback,
    rawText: raw.raw,
  };
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Returns true when the given URL looks like a login/auth redirect.
 * Uses path and hostname checks to avoid substring false-positives
 * (e.g. "evil-login.microsoftonline.com.attacker.com").
 */
function isLoginRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Brightspace-internal auth paths
    if (pathname.startsWith("/d2l/lp/auth/login") || pathname.startsWith("/d2l/login")) {
      return true;
    }

    // Microsoft Entra ID (SSO) — hostname must be exactly login.microsoftonline.com
    // or a subdomain of microsoftonline.com
    if (hostname === "login.microsoftonline.com" || hostname.endsWith(".microsoftonline.com")) {
      return true;
    }

    return false;
  } catch {
    // Unparseable URL — treat conservatively as not a login redirect
    return false;
  }
}

// ── Tool registration ─────────────────────────────────────────────────────────

/**
 * Register review_module_against_oal tool.
 *
 * The tool:
 * 1. Loads the saved Playwright storage state (browser cookies) so it can
 *    navigate Brightspace without triggering a new SSO login.
 * 2. Scrapes the target teaching module page and extracts a structured summary.
 * 3. Optionally scrapes the OAL toolkit page and extracts criteria text.
 * 4. Returns a JSON payload ready for AI-driven pedagogical comparison.
 */
export function registerReviewModuleAgainstOal(
  server: McpServer,
  config: AppConfig
): void {
  server.registerTool(
    "review_module_against_oal",
    {
      title: "Review Module Design Against OAL Toolkit",
      description:
        "Use Playwright to open a teaching module in Brightspace and extract its structure and content. " +
        "Optionally also opens the OAL toolkit page in the Digital Learning module to extract design criteria. " +
        "Returns a structured JSON payload (moduleSummary + oalCriteria) that you can use to compare the module's " +
        "design against the Online Active Learning (OAL) framework — covering Communication, Content, " +
        "Collaboration, and Practice & Feedback design areas. " +
        "After calling this tool, analyse moduleSummary against oalCriteria: " +
        "summarise alignment per OAL design area, highlight gaps, and suggest concrete improvements " +
        "appropriate for NP lecturers using language from the OAL toolkit.",
      inputSchema: ReviewModuleAgainstOalSchema,
    },
    async (args: any) => {
      let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
      let context: BrowserContext | null = null;

      try {
        log("DEBUG", "review_module_against_oal tool called", { args });

        const { targetCourseId, targetUrl, oalToolkitUrl } =
          ReviewModuleAgainstOalSchema.parse(args);

        // Resolve the module URL — prefer explicit targetUrl, fall back to course home
        const moduleUrl =
          targetUrl ?? `${config.baseUrl}/d2l/le/content/${targetCourseId}/Home`;

        // Load saved storage state (cookies written by browser-auth.ts)
        const storageStatePath = path.join(config.sessionDir, "storage-state.json");
        let storageStateOption: { path: string } | undefined;
        try {
          await fs.access(storageStatePath);
          storageStateOption = { path: storageStatePath };
          log("DEBUG", `review_module_against_oal: using saved storage state at ${storageStatePath}`);
        } catch {
          log("WARN", "review_module_against_oal: no saved storage state found — browser may redirect to login");
        }

        // Launch a headless browser (non-persistent, does not conflict with auth flow)
        browser = await chromium.launch({
          headless: true,
          args: buildChromiumArgs(),
        });

        context = await browser.newContext({
          storageState: storageStateOption,
          viewport: { width: 1280, height: 900 },
        });

        // ── Step 1: Scrape the target module page ────────────────────────────
        const page: Page = await context.newPage();

        log("INFO", `review_module_against_oal: navigating to module URL: ${moduleUrl}`);
        await page.goto(moduleUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Check if we were redirected to a login page (use hostname-level checks to avoid
        // substring false-positives, e.g. "login.microsoftonline.com.evil.com")
        const afterNav = page.url();
        if (isLoginRedirect(afterNav)) {
          return errorResponse(
            "Brightspace session has expired. Run `npx brightspace-mcp-server auth` (or `brightspace-auth`) " +
            "to re-authenticate, then try this tool again."
          );
        }

        // Wait a moment for dynamic content to settle
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
          log("DEBUG", "review_module_against_oal: networkidle timeout — continuing with partial content");
        });

        const moduleSummary = await extractModuleSummary(page, afterNav);
        log("INFO", `review_module_against_oal: extracted module summary for course ${targetCourseId} (${moduleSummary.sections.length} sections)`);

        // ── Step 2: Optionally scrape the OAL toolkit page ──────────────────
        let oalCriteria: OalCriteria | null = null;

        if (oalToolkitUrl) {
          log("INFO", `review_module_against_oal: navigating to OAL toolkit URL: ${oalToolkitUrl}`);

          const oalPage: Page = await context.newPage();
          await oalPage.goto(oalToolkitUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

          const afterOalNav = oalPage.url();
          if (isLoginRedirect(afterOalNav)) {
            log("WARN", "review_module_against_oal: OAL toolkit page redirected to login — skipping OAL extraction");
          } else {
            await oalPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
              log("DEBUG", "review_module_against_oal: OAL networkidle timeout — continuing with partial content");
            });

            oalCriteria = await extractOalCriteria(oalPage);
            log("INFO", "review_module_against_oal: OAL criteria extracted");
          }

          await oalPage.close();
        }

        await page.close();

        // ── Build and return structured payload ──────────────────────────────
        return toolResponse({
          targetCourseId,
          moduleSummary,
          oalCriteria,
          notes: oalCriteria
            ? "Use moduleSummary and oalCriteria to evaluate the module design. Assess each OAL area (Communication, Content, Collaboration, Practice & Feedback), highlight strengths and gaps, and recommend concrete improvements."
            : "oalCriteria is null because no oalToolkitUrl was provided. Supply oalToolkitUrl to include OAL criteria in the response.",
        });
      } catch (error) {
        return sanitizeError(error);
      } finally {
        if (context) {
          try { await context.close(); } catch { /* ignore */ }
        }
        if (browser) {
          try { await browser.close(); } catch { /* ignore */ }
        }
      }
    }
  );
}
