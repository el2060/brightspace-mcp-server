import { describe, it, expect, vi } from "vitest";
import { MicrosoftSSOFlow } from "../../src/auth/microsoft-sso.js";
import type { Page } from "playwright";

/**
 * Build a minimal Page mock.
 *
 * @param initialUrl - The URL returned by page.url().
 * @param waitForURLResolves - When true, waitForURL() resolves immediately (simulates fast
 *                             redirect to /d2l/home); otherwise it stays pending forever.
 * @param waitForSelectorResolves - When true, waitForSelector() resolves immediately
 *                                  (simulates the email input appearing).
 */
function makePage(
  initialUrl: string,
  waitForURLResolves: boolean,
  waitForSelectorResolves: boolean
): Page {
  let currentUrl = initialUrl;

  const page = {
    url: vi.fn(() => currentUrl),
    waitForURL: vi.fn(async (_pattern: unknown, _options?: unknown) => {
      if (waitForURLResolves) {
        currentUrl = "https://lms.example.edu/d2l/home";
        return;
      }
      return new Promise<void>(() => {});
    }),
    waitForSelector: vi.fn(async (_selector: unknown, _options?: unknown) => {
      if (waitForSelectorResolves) {
        return {} as object;
      }
      return new Promise<object>(() => {});
    }),
    fill: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    waitForLoadState: vi.fn(async () => {}),
    $: vi.fn(async () => null),
  } as unknown as Page;

  return page;
}

describe("MicrosoftSSOFlow", () => {
  describe("login — fast-path when already on /d2l/home", () => {
    it("returns true immediately if page URL already contains /d2l/home", async () => {
      const page = makePage("https://lms.example.edu/d2l/home", false, false);
      const flow = new MicrosoftSSOFlow({ username: "user@example.edu", password: "secret" });

      const result = await flow.login(page);

      expect(result).toBe(true);
      // Should not try to fill any form fields
      expect((page.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe("enterEmail — auto-SSO redirect detection", () => {
    it("short-circuits when /d2l/home URL is reached before email input", async () => {
      // waitForURL resolves immediately (home redirect wins); email input never appears
      const page = makePage(
        "https://login.microsoftonline.com/tenant/oauth2/authorize",
        /* waitForURLResolves */ true,
        /* waitForSelectorResolves */ false
      );

      const flow = new MicrosoftSSOFlow({ username: "user@example.edu", password: "secret" });
      const result = await flow.login(page);

      expect(result).toBe(true);
      // No form interaction should have occurred
      expect((page.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
      expect((page.click as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });

    it("proceeds with email form when email input appears before /d2l/home redirect", async () => {
      // waitForSelector resolves immediately (email wins); waitForURL also resolves
      // to allow the subsequent MFA and final-redirect waits to complete.
      const page = makePage(
        "https://login.microsoftonline.com/tenant/oauth2/authorize",
        /* waitForURLResolves */ true,
        /* waitForSelectorResolves */ true
      );

      const flow = new MicrosoftSSOFlow({ username: "user@example.edu", password: "secret" });
      const result = await flow.login(page);

      expect(result).toBe(true);
      // Email should have been filled
      expect((page.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe("hasCredentials", () => {
    it("returns true when both username and password are provided", () => {
      const flow = new MicrosoftSSOFlow({ username: "user@example.edu", password: "secret" });
      expect(flow.hasCredentials()).toBe(true);
    });

    it("returns false when username is missing", () => {
      const flow = new MicrosoftSSOFlow({ password: "secret" });
      expect(flow.hasCredentials()).toBe(false);
    });

    it("returns false when password is missing", () => {
      const flow = new MicrosoftSSOFlow({ username: "user@example.edu" });
      expect(flow.hasCredentials()).toBe(false);
    });

    it("returns false when both are missing", () => {
      const flow = new MicrosoftSSOFlow({});
      expect(flow.hasCredentials()).toBe(false);
    });
  });
});
