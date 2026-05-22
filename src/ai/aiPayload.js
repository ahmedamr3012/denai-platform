// ================================================================
// aiPayload.js — PHI-safe AI payload construction
// Phase 15: AI safety-boundary infrastructure
//
// Single source of truth for the AI/PHI boundary.
// Defines which patient state fields may be passed to any AI system
// (current local engines or any future cloud AI call site).
// build(state) strips PHI — returns clinical context only.
// isSafe(payload) asserts no prohibited fields are present.
//
// Pure computation — no DOM access, no clinical logic changes.
// ================================================================
window.denaiAIPayload = (function () {
  'use strict';

  // Explicit allowlist: clinical signal fields safe for AI consumption.
  // These are structural/physiological inputs — no patient identity.
  var AI_SAFE_FIELDS = Object.freeze([
    // Core clinical condition
    'condition', 'bone', 'hygiene', 'occlusion',
    'remainingStructure', 'endodonticStatus', 'parafunction',
    'smoking', 'diabetes', 'abutmentQuality',
    // Tooth context — anatomical position only, not patient identity
    'tooth', 'tooth2',
    // Age — clinical scoring input (young/elderly flags);
    // used without name, not a HIPAA-18 identifier in isolation
    'age',
    // Multi-tooth / compound-case routing flags
    'multiTooth', 'multiSite', 'activeSite',
    // Compound second-site fields — same safety profile as primary
    'site2Tooth', 'site2Condition', 'site2Structure', 'site2EndoStatus',
    // Clinic pricing schedule — not patient-identifying
    'costImplant', 'costBridge', 'costCrown',
    'costBoneGraft', 'costRCT', 'costPostCore',
  ]);

  // Explicit exclusion list — AI systems MUST NOT receive these.
  // Listed for auditability; isSafe() enforces this at future cloud call sites.
  var EXCLUDED_FIELDS = Object.freeze([
    'id', 'name', 'gender',           // patient identity
    'notes', 'labNotes',              // free-text (may contain identifiers)
    'reportHistory', 'serviceDate',   // dates and metadata
    'lastAccessed', 'wfHistory',      // operational timestamps
    'clinicId', 'caseNum',            // organizational identifiers
    'planApproved', 'labStatus',      // workflow state
    'caseDelivered', 'lastView', 'tx',// UI/workflow state — not clinical inputs
  ]);

  // ── Main entry: construct PHI-safe clinical payload ──────────────
  // Copies only AI_SAFE_FIELDS values from a patient state object.
  // All identity fields, free-text fields, and workflow metadata are left behind.
  // Returns null when state is missing required clinical inputs (engine can't run).
  function build(state) {
    if (!state || typeof state !== 'object') return null;
    if (!state.bone || !state.hygiene || !state.condition) return null;
    var payload = {};
    for (var i = 0; i < AI_SAFE_FIELDS.length; i++) {
      var key = AI_SAFE_FIELDS[i];
      if (key in state) payload[key] = state[key];
    }
    return payload;
  }

  // ── PHI assertion for future cloud AI call sites ─────────────────
  // Returns true when the payload contains no prohibited fields.
  // Call this before transmitting any payload to an external AI service.
  // Usage: if (!denaiAIPayload.isSafe(payload)) { log error; abort; }
  function isSafe(payload) {
    if (!payload || typeof payload !== 'object') return true;
    for (var i = 0; i < EXCLUDED_FIELDS.length; i++) {
      if (EXCLUDED_FIELDS[i] in payload) return false;
    }
    return true;
  }

  return Object.freeze({
    build:          build,
    isSafe:         isSafe,
    AI_SAFE_FIELDS: AI_SAFE_FIELDS,
    EXCLUDED_FIELDS: EXCLUDED_FIELDS,
  });
})();
