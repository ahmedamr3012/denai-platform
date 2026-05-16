// tests/ci/accessibility.spec.js
// Accessibility CI Gate — axe-core WCAG 2.0 A/AA audit
//
// Checks:
//   1. Entry overlay      — role="dialog" with accessible buttons
//   2. Main shell         — full page after overlay dismissed
//   3. Sidebar            — nav landmark, menubar/menuitem structure
//   4. Workflow bar       — rendered workflow stage list
//   5. Auth modal         — dialog structure, form labels, focus target
//   6. Keyboard tab order — Tab navigates to interactive elements, never stuck
//
// Failure threshold: critical + serious violations → CI fails.
// Moderate + minor violations are reported as advisory only (non-blocking).
//
// Auth sentinel: denaiAuth.init() is fire-and-forget after render(S).
// Waiting for status ≠ 'reconnecting' before any interaction ensures the auth
// state is stable before the mock-free accessibility checks run.
'use strict';

const { test, expect }             = require('@playwright/test');
const { injectAxe, getViolations } = require('axe-playwright');
const { AXE_OPTIONS, reportBlockers } = require('../a11y/runner');

test.describe('Accessibility', () => {

  test('a11y audit — shell, navigation, workflow, modal, keyboard', async ({ page }) => {
    await page.goto('/');

    // Standard render sentinel
    await page.waitForFunction(
      () => typeof window.render === 'function',
      null,
      { timeout: 15_000 }
    );

    // Auth-settle sentinel — avoids race with _restoreSession() in-flight
    await page.waitForFunction(
      () => window.denaiAuth && window.denaiAuth.getStatus() !== 'reconnecting',
      null,
      { timeout: 15_000 }
    );

    await injectAxe(page);

    const allBlockers = [];

    // Helper: run axe on `context` (CSS selector string or null for full page),
    // collect critical/serious blockers into allBlockers.
    async function check(id, context) {
      const violations = await getViolations(page, context || null, AXE_OPTIONS);
      const blockers   = reportBlockers(violations, id);
      allBlockers.push(...blockers);
    }

    // ── 1. Entry overlay ─────────────────────────────────────────────────────
    // Visible on first load (no denaiEntryDismissed_v1 in fresh Playwright context).
    await check('entry-overlay', '#entryOverlay');

    // ── 2. Main application shell ─────────────────────────────────────────────
    // Dismiss the overlay; wait for transitionend to set display:none.
    await page.evaluate(() => window.continueLocally());
    await page.waitForFunction(
      () => {
        const el = document.getElementById('entryOverlay');
        return !el || el.style.display === 'none';
      },
      null,
      { timeout: 5_000 }
    );

    // Full-page check: landmarks, headings, ARIA, form labels, color contrast.
    await check('main-shell', null);

    // ── 3. Sidebar navigation ─────────────────────────────────────────────────
    await check('sidebar', '#sidebar');

    // ── 4. Workflow bar ───────────────────────────────────────────────────────
    await check('workflow-bar', '#workflowBar');

    // ── 5. Auth modal ─────────────────────────────────────────────────────────
    await page.evaluate(() => window.openAuthModal());
    // openAuthModal() sets display:'flex' synchronously — no transition.
    await page.waitForFunction(
      () => {
        const el = document.getElementById('authModal');
        return el && el.style.display === 'flex';
      },
      null,
      { timeout: 5_000 }
    );

    await check('auth-modal', '#authModal');

    // Close modal (synchronous display:none, no transition needed)
    await page.evaluate(() => window.closeAuthModal());

    // ── 6. Keyboard tab order ─────────────────────────────────────────────────
    // Verifies Tab navigation is not broken at the structural level.
    // First Tab from a focused body must land on an interactive element.
    // Subsequent Tabs must keep moving (focus never stuck on body).
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press('Tab');

    const firstFocusTag = await page.evaluate(
      () => document.activeElement ? document.activeElement.tagName.toLowerCase() : 'body'
    );

    expect(
      firstFocusTag,
      'first Tab keypress must land on an interactive element, not body'
    ).not.toBe('body');
    expect(
      firstFocusTag,
      'first Tab keypress must not remain on html root'
    ).not.toBe('html');

    // Tab 5 more times and verify focus keeps advancing (no structural trap).
    const seenTags = new Set([firstFocusTag]);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(
        () => document.activeElement ? document.activeElement.tagName.toLowerCase() : 'body'
      );
      seenTags.add(tag);
    }

    expect(
      seenTags.has('body'),
      'Tab navigation must not get stuck on body after 6 keystrokes — focus must stay on interactive elements'
    ).toBe(false);

    // ── Final assertion ───────────────────────────────────────────────────────
    expect(
      allBlockers.length,
      `${allBlockers.length} critical/serious accessibility violation(s) — see [FAIL a11y] lines above`
    ).toBe(0);
  });

});
