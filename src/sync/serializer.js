// src/sync/serializer.js
// Wave 7D: Patient serializer for cloud write path.
// Produces a cloud-safe JSONB payload from a local patient object.
//
// EXCLUDED fields (must never reach the cloud):
//   notes      — PHI, deferred to Wave 7G (client-side AES-GCM encryption)
//   activeSite — device-local navigation state (meaningless on another device)
//   AI outputs — deterministically computed; never stored
//
// Matches Wave 7C schema contract: patients.state JSONB.
// Uses an explicit allowlist — any new DEFAULT_STATE field stays local-only
// until deliberately added here.

window.denaiSerializer = (function () {

  var SYNC_SCHEMA_VERSION = 1; // must match schema.sql schema_ver DEFAULT

  // Explicit allowlist — not a denylist. New fields require a deliberate addition.
  var ALLOWED_FIELDS = [
    'id', 'caseNum',
    'name', 'age', 'gender',
    'tooth', 'condition', 'bone', 'hygiene', 'occlusion', 'tx',
    'smoking', 'diabetes', 'remainingStructure', 'endodonticStatus', 'parafunction',
    'multiTooth', 'tooth2', 'abutmentQuality',
    'multiSite', 'site2Tooth', 'site2Condition', 'site2Structure', 'site2EndoStatus',
    'costImplant', 'costBridge', 'costBoneGraft', 'costCrown', 'costRCT', 'costPostCore',
    'costBridge4', 'costOverlay', 'costEndocrown',
    // R3.1: clinician material selection — synced so material choice follows patient across devices
    'selectedMaterial',
    // Wave 8C: workflow continuity — synced so plan/lab state follows patient across devices
    'planApproved', 'labStatus', 'caseDelivered',
    // Wave 4A: serviceDate — ISO date (YYYY-MM-DD) case was opened; synced as clinical record metadata
    'serviceDate',
    // A2: frozen fabrication spec — synced so lab sheet reprints are consistent across devices
    'labSnapshot',
    // lastAccessed and reportHistory are intentionally excluded: device-local + large array
  ];

  // serializePatient — pure function. Never mutates src. Tolerates missing fields.
  // Returns null if src is not a valid object.
  // Output goes into the patients.state JSONB column — notes and activeSite are excluded.
  // notes_enc is a SEPARATE top-level column handled in syncQueue._executeOp (not here).
  /**
   * @param {Partial<PatientState>} src
   * @returns {Partial<PatientState>|null}
   */
  function serializePatient(src) {
    if (!src || typeof src !== 'object') return null;
    var out = {};
    for (var i = 0; i < ALLOWED_FIELDS.length; i++) {
      var f = ALLOWED_FIELDS[i];
      if (f in src) out[f] = src[f];
    }
    out.schema_ver = SYNC_SCHEMA_VERSION;
    return out;
  }

  return Object.freeze({ serializePatient: serializePatient });

})();
