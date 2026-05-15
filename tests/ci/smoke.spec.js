// tests/ci/smoke.spec.js
// Wave 6B — DOM Smoke CI Gate (Tier 1: Synchronous Only)
//
// Injects tests/smoke/runner.js into the live page and executes
// DenaiSmokeRunner.runAll(). 3 scenarios, Tier 1 synchronous assertions only.
//
// Failure conditions:
//   - [denai EB] console.error fires during initial page render
//   - Uncaught JS exceptions (pageerror) during page load
//   - Any smoke scenario assertion fails (EB fire, fallback element,
//     missing DOM target, NaN in SVG, wrong card active state)
//
// Invariants:
//   - Does NOT call setState, saveState, or touch localStorage.
//   - Does NOT assert animation completion (animateNumber, RAF, typewriter).
//   - Does NOT assert IntersectionObserver-gated comparison table content.
//   - Tier 1 only — no async waits, no test hooks (Df-1 not yet wired).
'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');
const fs               = require('fs');

const RUNNER_PATH = path.resolve(__dirname, '../smoke/runner.js');

test.describe('DOM Smoke Suite (Tier 1)', () => {

  test('render pipeline clean — no EB fires, no uncaught errors', async ({ page }) => {
    // ── Phase 1: capture errors that occur during initial page render ────────
    // These are captured BEFORE the smoke runner injects its own console.error
    // interceptor, ensuring we detect EB fires from the app's startup render.
    /** @type {string[]} */
    const loadErrors = [];
    /** @type {boolean} */
    let   loadPhase  = true;

    page.on('console', msg => {
      if (loadPhase && msg.type() === 'error') {
        loadErrors.push(msg.text());
      }
    });

    // Capture uncaught JS exceptions throughout the full test.
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // ── Phase 2: navigate and wait for the orchestration kernel ─────────────
    await page.goto('/');

    // render() is defined in the inline <script> block at the bottom of <body>.
    // DOMContentLoaded fires after all blocking scripts (including that block)
    // have executed — this waitForFunction is a deterministic guard.
    await page.waitForFunction(
      () => typeof window.render === 'function',
      null,
      { timeout: 15_000 }
    );

    // End load-phase capture: anything after this point is the smoke runner's
    // own execution territory (which manages its own console.error intercept).
    loadPhase = false;

    // ── Phase 3: inject and run smoke runner ─────────────────────────────────
    await page.addScriptTag({ content: fs.readFileSync(RUNNER_PATH, 'utf8') });

    /**
     * @typedef {{ id: string, pass: boolean, failures: string[], assertionCount: number }} SmokeResult
     * @type {{ passed: number, failed: number, total: number, totalAssertions: number, results: SmokeResult[] }}
     */
    const result = await page.evaluate(() => window.DenaiSmokeRunner.runAll());

    // ── Surface failures ──────────────────────────────────────────────────────
    if (result.failed > 0) {
      for (const r of result.results) {
        if (!r.pass) {
          for (const msg of r.failures) {
            console.error(`[FAIL smoke] ${r.id}: ${msg}`);
          }
        }
      }
    }

    const ebErrors = loadErrors.filter(e => e.includes('[denai EB]'));
    if (ebErrors.length > 0) {
      for (const e of ebErrors) console.error(`[EB load] ${e}`);
    }
    if (pageErrors.length > 0) {
      for (const e of pageErrors) console.error(`[UNCAUGHT] ${e}`);
    }

    // ── Assertions ────────────────────────────────────────────────────────────
    expect(
      ebErrors,
      '[denai EB] errors fired during initial page render — see [EB load] lines above'
    ).toHaveLength(0);

    expect(
      pageErrors,
      'uncaught JS exceptions during page load — see [UNCAUGHT] lines above'
    ).toHaveLength(0);

    expect(
      result.totalAssertions,
      'runner produced zero assertions — smoke runner may not have loaded correctly'
    ).toBeGreaterThan(0);

    expect(
      result.failed,
      `${result.failed} of ${result.total} smoke scenario(s) failed — see [FAIL smoke] lines above`
    ).toBe(0);
  });

});
