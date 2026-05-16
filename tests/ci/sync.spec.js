// tests/ci/sync.spec.js
// Beta Hardening — Cloud Sync Pipeline CI Gate
//
// Injects tests/sync/runner.js into the live page and executes
// DenaiSyncRunner.runAll(). 11 scenarios across 4 groups.
//
// Groups:
//   1. Serializer allowlist  — 5 pure-function scenarios (no state)
//   2. SyncQueue lifecycle   — 4 scenarios (isolated queue state)
//   3. Tombstone protection  — 1 scenario  (mocked hydrate, syncQueue stub)
//   4. Placeholder protection— 1 scenario  (mocked hydrate, real queue)
//
// Invariants:
//   - Does NOT modify runtime orchestration, render, or localStorage
//     outside of isolated save/restore blocks in the runner.
//   - All window.denaiAuth and window.denaiSyncQueue patches are
//     restored before the runner returns.
'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');
const fs               = require('fs');

const RUNNER_PATH = path.resolve(__dirname, '../sync/runner.js');

test.describe('Cloud Sync Pipeline', () => {

  test('sync pipeline regression — serializer, queue, tombstone, placeholder protection', async ({ page }) => {
    await page.goto('/');

    // render() is a function declaration in the inline <script> block — its
    // presence guarantees all blocking <script src> tags (including all sync
    // modules) have fully executed. Same sentinel used by engine/smoke specs.
    await page.waitForFunction(
      () => typeof window.render === 'function',
      null,
      { timeout: 15_000 }
    );

    await page.addScriptTag({ content: fs.readFileSync(RUNNER_PATH, 'utf8') });

    // Runner is async (tombstone + placeholder groups call hydrate()).
    // page.evaluate() awaits the returned Promise automatically.
    /**
     * @typedef {{ id: string, pass: boolean, failures: string[], assertionCount: number }} SyncResult
     * @type {{ passed: number, failed: number, total: number, totalAssertions: number, results: SyncResult[] }}
     */
    const result = await page.evaluate(async () => window.DenaiSyncRunner.runAll());

    if (result.failed > 0) {
      for (const r of result.results) {
        if (!r.pass) {
          for (const msg of r.failures) {
            console.error(`[FAIL sync] ${r.id}: ${msg}`);
          }
        }
      }
    }

    expect(
      result.totalAssertions,
      'runner produced zero assertions — tests/sync/runner.js may not have loaded correctly'
    ).toBeGreaterThan(0);

    expect(
      result.results,
      'runner returned no results array — DenaiSyncRunner may not be defined'
    ).toBeTruthy();

    expect(
      result.failed,
      `${result.failed} of ${result.total} sync scenario(s) failed — see [FAIL sync] lines above`
    ).toBe(0);
  });

});
