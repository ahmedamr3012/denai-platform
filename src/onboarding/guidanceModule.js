// src/onboarding/guidanceModule.js
// Phase 9: Operational confidence guidance tracking.
// Lightweight seen-state tracker only — no tour engine, no analytics.
// Rendering is done by existing render paths in index.html.

window.denaiGuidance = (function () {
  'use strict';

  var _PREFIX = 'denaiGuide_v1_';

  // Returns true if this guidance key has been dismissed.
  // Defaults to true on storage error so guidance never blocks workflow.
  function hasSeen(key) {
    try { return localStorage.getItem(_PREFIX + key) === '1'; } catch (e) { return true; }
  }

  function markSeen(key) {
    try { localStorage.setItem(_PREFIX + key, '1'); } catch (e) {}
  }

  return Object.freeze({ hasSeen: hasSeen, markSeen: markSeen });
})();
