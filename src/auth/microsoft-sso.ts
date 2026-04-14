/**
 * Brightspace MCP Server
 * Copyright (c) 2025 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 *
 * Generic Microsoft Entra ID (formerly Azure AD) SSO flow.
 * Used by schools that authenticate via login.microsoftonline.com
 * (e.g. Ngee Ann Polytechnic, and any other institution using
 * Microsoft Entra ID as their identity provider).
 *
 * Selector differences vs Purdue/Shibboleth:
 *   Shibboleth: input#username, input#password, button[name="_eventId_proceed"]
 *   Microsoft:  input[type="email"], input[type="password"], input[type="submit"]
 */

import type { Page } from "playwright";
import { BrowserAuthError } from "../utils/errors.js";
import { log } from "../utils/logger.js";

const SELECTORS = {
  // Step 1 — email entry
  emailInput: 'input[type="email"]',
  emailNext: 'input[type="submit"]',

  // Step 2 — password entry (Microsoft shows password on a separate page)
  passwordInput: 'input[type="password"]',
  passwordSubmit: 'input[type="submit"]',

  // Step 3 — "Stay signed in?" (KMSI prompt)
  kmsiYes: 'input[type="submit"][value="Yes"]',
  // Some tenants use a button instead
  kmsiYesButton: 'button[data-testid="primaryButton"]',
} as const;

interface MicrosoftSSOConfig {
  username?: string;
  password?: string;
}

export class MicrosoftSSOFlow {
  private config: MicrosoftSSOConfig;

  constructor(config: MicrosoftSSOConfig) {
    this.config = config;
  }

  /**
   * Returns true if credentials are available for automated SSO login.
   */
  hasCredentials(): boolean {
    return Boolean(this.config.username && this.config.password);
  }

  /**
   * Execute the full Microsoft Entra ID SSO login flow.
   * Handles email entry, password entry, MFA (Duo/Authenticator push),
   * and the "Stay signed in?" KMSI prompt.
   */
  async login(page: Page): Promise<boolean> {
    try {
      log("INFO", "Starting Microsoft Entra ID SSO login flow");

      await this.enterEmail(page);
      await this.enterPassword(page);
      await this.handleMFA(page);
      await this.handleKMSI(page);

      // Wait for successful redirect back to Brightspace
      await page.waitForURL(/\/d2l\/home/, { timeout: 120000 });
      log("INFO", "Login successful — reached Brightspace home");

      return true;
    } catch (error) {
      log("ERROR", "Microsoft SSO login flow failed", error);
      return false;
    }
  }

  /**
   * Manual login fallback — open a headed browser and wait for the user
   * to log in and complete MFA themselves (up to 5 minutes).
   */
  async manualLogin(page: Page): Promise<boolean> {
    try {
      log("INFO", "No saved credentials — browser window is open.");
      log("INFO", "Please log in manually and approve MFA. Waiting up to 5 minutes...");
      await page.waitForURL(/\/d2l\/home/, { timeout: 300000 });
      log("INFO", "Manual login successful — reached Brightspace home");
      return true;
    } catch (error) {
      log("ERROR", "Manual login timed out or failed", error);
      return false;
    }
  }

  private async enterEmail(page: Page): Promise<void> {
    try {
      log("DEBUG", "Waiting for Microsoft email input");
      await page.waitForSelector(SELECTORS.emailInput, { timeout: 30000 });

      if (!this.config.username) {
        throw new BrowserAuthError("Username is required for SSO login", "credentials");
      }

      log("INFO", "Entering email address");
      await page.fill(SELECTORS.emailInput, this.config.username);

      // Click Next / Submit to proceed to password page
      await page.click(SELECTORS.emailNext);
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch (error) {
      if (error instanceof BrowserAuthError) throw error;
      throw new BrowserAuthError("Failed to enter email", "credentials", error as Error);
    }
  }

  private async enterPassword(page: Page): Promise<void> {
    try {
      log("DEBUG", "Waiting for Microsoft password input");
      await page.waitForSelector(SELECTORS.passwordInput, { timeout: 30000 });

      if (!this.config.password) {
        throw new BrowserAuthError("Password is required for SSO login", "credentials");
      }

      log("INFO", "Entering password");
      await page.fill(SELECTORS.passwordInput, this.config.password);
      await page.click(SELECTORS.passwordSubmit);
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch (error) {
      if (error instanceof BrowserAuthError) throw error;
      throw new BrowserAuthError("Failed to enter password", "credentials", error as Error);
    }
  }

  private async handleMFA(page: Page): Promise<void> {
    try {
      log("WARN", "Waiting for MFA approval (Duo/Microsoft Authenticator)...");
      log("INFO", "Please approve the push notification on your phone. Timeout: 120 seconds.");

      // Wait until we leave the Microsoft login domain — indicates MFA was approved
      // and we are being redirected back toward Brightspace/SAML
      await page.waitForURL(
        (url) => {
          const href = url.toString();
          return (
            href.includes("/d2l/") ||
            href.includes("kmsi") ||
            href.includes("SAMLResponse") ||
            href.includes("/sso/") ||
            // Some tenants redirect to a consent or KMSI page still on Microsoft
            (href.includes("microsoftonline.com") && href.includes("kmsi"))
          );
        },
        { timeout: 120000 }
      );
      log("INFO", `MFA completed — now at: ${page.url()}`);
    } catch (error) {
      throw new BrowserAuthError(
        "MFA approval timed out after 120 seconds",
        "mfa_approval",
        error as Error
      );
    }
  }

  private async handleKMSI(page: Page): Promise<void> {
    try {
      log("DEBUG", "Checking for 'Stay signed in?' (KMSI) prompt");

      // Try the input[type=submit] variant first, then the button variant
      const kmsi =
        (await page.$(SELECTORS.kmsiYes)) ??
        (await page.$(SELECTORS.kmsiYesButton));

      if (kmsi) {
        log("INFO", "Clicking Yes on 'Stay signed in?' prompt");
        await kmsi.click();
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } else {
        log("DEBUG", "No KMSI prompt found (normal — not all tenants show it)");
      }
    } catch {
      // KMSI prompt is optional — swallow errors
      log("DEBUG", "KMSI handling skipped (prompt not present or already dismissed)");
    }
  }
}
