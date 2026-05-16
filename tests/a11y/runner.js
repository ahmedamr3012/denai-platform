// tests/a11y/runner.js
// Accessibility test utilities for tests/ci/accessibility.spec.js.
// Node.js module — NOT injected into the browser page.
//
// Usage:
//   const { AXE_OPTIONS, filterBlockers, reportBlockers } = require('../a11y/runner');
'use strict';

// Violations at these impact levels block CI.
// 'moderate' and 'minor' are reported as advisory only — they surface in the
// console but do not fail the suite.
const BLOCKER_IMPACTS = new Set(['critical', 'serious']);

// axe runOnly: WCAG 2.0 Level A + AA.
// Not including 'best-practice' to avoid noise from advisory rules (e.g.
// page-has-heading-one, region) that are not formal WCAG requirements.
const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
};

function filterBlockers(violations) {
  return violations.filter(v => BLOCKER_IMPACTS.has(v.impact));
}

function summarizeViolation(v) {
  const nodeCount = (v.nodes || []).length;
  const examples  = (v.nodes || []).slice(0, 2)
    .map(n => (n.target && n.target[0]) ? n.target[0] : '(unknown)')
    .join(', ');
  return `[${(v.impact || '?').toUpperCase()}] ${v.id}: ${v.description} ` +
         `(${nodeCount} node${nodeCount !== 1 ? 's' : ''}: ${examples})`;
}

// Prints critical/serious violations to console.error and advisory to console.log.
// Returns only the blockers array.
function reportBlockers(violations, checkId) {
  const blockers = filterBlockers(violations);
  blockers.forEach(v => {
    console.error(`[FAIL a11y:${checkId}] ${summarizeViolation(v)}`);
  });
  const advisory = violations.filter(v => !BLOCKER_IMPACTS.has(v.impact));
  if (advisory.length > 0) {
    console.log(`[INFO a11y:${checkId}] ${advisory.length} minor/moderate (advisory, non-blocking)`);
    advisory.forEach(v => {
      console.log(`  [${(v.impact || '?').toUpperCase()}] ${v.id}: ${v.description}`);
    });
  }
  return blockers;
}

module.exports = { BLOCKER_IMPACTS, AXE_OPTIONS, filterBlockers, summarizeViolation, reportBlockers };
