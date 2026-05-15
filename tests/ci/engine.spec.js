// tests/ci/engine.spec.js
// Wave 6B — Engine Regression CI Gate
//
// Injects tests/engine/scenarios.js + tests/engine/runner.js into the live
// page and executes DenaiEngineRunner.runAll(). Every scenario must pass.
//
// Invariants:
//   - Does NOT modify S, setState, render, or localStorage.
//   - Does NOT depend on DOM state or animation completion.
//   - Fully deterministic: frozen state copies, pure ClinicalEngine calls.
//   - Flaky risk: ZERO (pure computation, no timers, no network).
'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');
const fs               = require('fs');

const SCENARIOS_PATH = path.resolve(__dirname, '../engine/scenarios.js');
const RUNNER_PATH    = path.resolve(__dirname, '../engine/runner.js');

test.describe('Engine Regression', () => {

  test('all 9 scenarios pass — zero ClinicalEngine regressions', async ({ page }) => {
    await page.goto('/');

    // Wait for render() to land on window — the strongest available sentinel.
    // render() is a function declaration in the inline <script> block at the
    // bottom of <body>, which executes AFTER all 10 blocking <script src> tags
    // in <head> (including clinicalEngine.js). If window.render exists,
    // ClinicalEngine is guaranteed to be in scope.
    // Note: ClinicalEngine is declared as `const` at classic-script top-level,
    // which does NOT become a window.* property — only function declarations
    // and `var` declarations do. render() is a function declaration, so
    // window.render is the correct and proven sentinel.
    await page.waitForFunction(
      () => typeof window.render === 'function',
      null,
      { timeout: 15_000 }
    );

    // Inject scenario registry first (runner reads window.DENAI_SCENARIOS).
    await page.addScriptTag({ content: fs.readFileSync(SCENARIOS_PATH, 'utf8') });
    // Inject the runner (registers window.DenaiEngineRunner).
    await page.addScriptTag({ content: fs.readFileSync(RUNNER_PATH, 'utf8') });

    /**
     * @typedef {{ id: string, pass: boolean, failures: string[], assertionCount: number }} ScenarioResult
     * @type {{ passed: number, failed: number, total: number, totalAssertions: number, results: ScenarioResult[] }}
     */
    const result = await page.evaluate(() => window.DenaiEngineRunner.runAll());

    // Surface each failing scenario as a distinct CI log line before the
    // terminal assertion so the failure is actionable without digging into
    // the runner's own console output.
    if (result.failed > 0) {
      for (const r of result.results) {
        if (!r.pass) {
          for (const msg of r.failures) {
            console.error(`[FAIL] ${r.id}: ${msg}`);
          }
        }
      }
    }

    expect(
      result.totalAssertions,
      'runner produced zero assertions — scenarios.js may not have loaded correctly'
    ).toBeGreaterThan(0);

    expect(
      result.results,
      'runner returned no results array — runner.js may not have loaded correctly'
    ).toBeTruthy();

    expect(
      result.failed,
      `${result.failed} of ${result.total} engine scenario(s) failed — see [FAIL] lines above`
    ).toBe(0);
  });

});
