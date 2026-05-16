// tests/ci/auth.spec.js
// Beta Hardening — Auth & Encryption CI Gate
//
// Injects tests/auth/runner.js into the live page and executes
// DenaiAuthRunner.runAll(). 12 scenarios across 4 groups.
//
// Groups:
//   1. Auth initial state    — 2 scenarios (read-only, fresh browser context)
//   2. Sign-out lifecycle    — 2 scenarios (real signOut(), verify side effects)
//   3. Encryption integrity  — 6 scenarios (PBKDF2 + AES-GCM roundtrip, failure modes)
//   4. Cloud PHI safety      — 2 scenarios (queue op structure, null-key guard)
//
// Extra wait: after the standard render() sentinel, the spec waits for auth to
// settle out of 'reconnecting' state. This is required because the page calls
// denaiAuth.init() as fire-and-forget after render(S). Without this wait, a
// race condition can cause the auth-state assertions to read stale 'reconnecting'.
'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');
const fs               = require('fs');

const RUNNER_PATH = path.resolve(__dirname, '../auth/runner.js');

test.describe('Auth & Encryption', () => {

  test('auth and encryption regression — lifecycle, crypto integrity, PHI safety', async ({ page }) => {
    await page.goto('/');

    // Standard render sentinel: guarantees all blocking <script src> tags have
    // executed, including notesEncryption.js, authModule.js, syncQueue.js.
    await page.waitForFunction(
      () => typeof window.render === 'function',
      null,
      { timeout: 15_000 }
    );

    // Auth-specific sentinel: denaiAuth.init() is called fire-and-forget after
    // render(S). While _restoreSession() is in-flight the status is 'reconnecting'.
    // Wait until it resolves to 'local' (no stored session in fresh Playwright
    // context) or 'signed-in' before running auth-state assertions.
    await page.waitForFunction(
      () => window.denaiAuth && window.denaiAuth.getStatus() !== 'reconnecting',
      null,
      { timeout: 15_000 }
    );

    await page.addScriptTag({ content: fs.readFileSync(RUNNER_PATH, 'utf8') });

    // Runner is async: signOut() and PBKDF2 key derivation are awaited internally.
    /**
     * @typedef {{ id: string, pass: boolean, failures: string[], assertionCount: number }} AuthResult
     * @type {{ passed: number, failed: number, total: number, totalAssertions: number, results: AuthResult[] }}
     */
    const result = await page.evaluate(async () => window.DenaiAuthRunner.runAll());

    if (result.failed > 0) {
      for (const r of result.results) {
        if (!r.pass) {
          for (const msg of r.failures) {
            console.error(`[FAIL auth] ${r.id}: ${msg}`);
          }
        }
      }
    }

    expect(
      result.totalAssertions,
      'runner produced zero assertions — tests/auth/runner.js may not have loaded correctly'
    ).toBeGreaterThan(0);

    expect(
      result.results,
      'runner returned no results array — DenaiAuthRunner may not be defined'
    ).toBeTruthy();

    expect(
      result.failed,
      `${result.failed} of ${result.total} auth/encryption scenario(s) failed — see [FAIL auth] lines above`
    ).toBe(0);
  });

});
