// tests/e2e/multidevice.spec.js
// Multi-Device E2E — Local-First Cloud Sync Simulation
//
// Injects tests/e2e/runner.js into the live page and executes
// DenaiE2ERunner.runAll(). 7 scenarios across 5 groups.
//
// Groups:
//   1. Cross-device hydration  — 1 scenario (Device B receives Device A patient)
//   2. Tombstone propagation   — 1 scenario (Device A deletion reaches Device B)
//   3. Offline → reconnect     — 2 scenarios (queue persistence + flush)
//   4. Conflict resolution     — 2 scenarios (cloud wins / local wins with pending edit)
//   5. Encryption continuity   — 1 scenario (same passphrase+salt decrypts across devices)
//
// All cloud interactions are simulated via mock Supabase clients.
// No real network calls are made — CI-safe and deterministic.
//
// Auth sentinel: denaiAuth.init() is fire-and-forget after render(S).
// The extra waitForFunction ensures auth has settled before mock replacement.
'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');
const fs               = require('fs');

const RUNNER_PATH = path.resolve(__dirname, './runner.js');

test.describe('Multi-Device E2E', () => {

  test('multi-device sync — hydration, tombstone, offline/reconnect, conflict, encryption', async ({ page }) => {
    await page.goto('/');

    // Standard render sentinel: guarantees all blocking <script src> tags have
    // executed, including cloudSync.js, syncQueue.js, notesEncryption.js.
    await page.waitForFunction(
      () => typeof window.render === 'function',
      null,
      { timeout: 15_000 }
    );

    // Auth sentinel: denaiAuth.init() is fire-and-forget after render(S).
    // Wait for auth to settle before replacing window.denaiAuth with mocks —
    // prevents a real _restoreSession() call from clobbering the mock state.
    await page.waitForFunction(
      () => window.denaiAuth && window.denaiAuth.getStatus() !== 'reconnecting',
      null,
      { timeout: 15_000 }
    );

    await page.addScriptTag({ content: fs.readFileSync(RUNNER_PATH, 'utf8') });

    /**
     * @typedef {{ id: string, pass: boolean, failures: string[], assertionCount: number }} E2EResult
     * @type {{ passed: number, failed: number, total: number, totalAssertions: number, results: E2EResult[] }}
     */
    const result = await page.evaluate(async () => window.DenaiE2ERunner.runAll());

    if (result.failed > 0) {
      for (const r of result.results) {
        if (!r.pass) {
          for (const msg of r.failures) {
            console.error(`[FAIL e2e] ${r.id}: ${msg}`);
          }
        }
      }
    }

    expect(
      result.totalAssertions,
      'runner produced zero assertions — tests/e2e/runner.js may not have loaded correctly'
    ).toBeGreaterThan(0);

    expect(
      result.results,
      'runner returned no results array — DenaiE2ERunner may not be defined'
    ).toBeTruthy();

    expect(
      result.failed,
      `${result.failed} of ${result.total} multi-device scenario(s) failed — see [FAIL e2e] lines above`
    ).toBe(0);
  });

});
