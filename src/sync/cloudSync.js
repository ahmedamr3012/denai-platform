// src/sync/cloudSync.js
// Wave 7E: Cloud Read Path & Multi-Device Continuity.
//
// LOCAL-FIRST INVARIANT: render(localStorage) ALWAYS fires first.
// hydrate() is called AFTER auth settles — never blocks startup.
// Cloud read failures are silent: local data is always preserved.
//
// ── Merge strategy ───────────────────────────────────────────────────────────
// Each local patient stores `_syncedAt` — the cloud `updated_at` timestamp
// from the last time we received that patient from the server.
//
//   cloud wins  when cloudRow.updated_at > local._syncedAt
//   local wins  when _syncedAt is absent (never synced), or local has a
//               pending unsent queue item (in-flight edit must not be overwritten)
//
// Fields NEVER merged from cloud: notes, activeSite, _syncedAt (see serializer).
// cloudRow.state will never contain these — the serializer strips them on upload.
//
// ── Scenarios handled ────────────────────────────────────────────────────────
// First-login  — cloud empty, local has patients → enqueue all for upload
// New-device   — local empty/placeholder, cloud has patients → hydrate localStorage
// Normal sync  — both sides have the patient, compare timestamps
// Conflict     — same patient edited on two devices → last cloud write wins
//                (pending local edits are protected by hasPendingFor guard)

window.denaiCloudSync = (function () {

  var PATIENTS_KEY   = 'denaiPatients_v2';
  var HISTORY_PREFIX = 'denaiCaseHistory_v1_';

  // Default placeholder name — used to detect the auto-generated seed patient
  // on a fresh install. Prevents uploading a meaningless placeholder to cloud.
  var DEFAULT_PATIENT_NAME = 'Mohamed A.';

  var _syncing        = false;
  var _lastHydratedAt = null; // ISO string — set after each successful hydrate

  // ── Public: hydrate ───────────────────────────────────────────────────────
  // Entry point. Called from authModule after session restore / sign-in.
  // Guards: signed in + online + not already running.

  async function hydrate() {
    if (_syncing) return;
    if (typeof denaiAuth === 'undefined' || !denaiAuth.isSignedIn()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    var client = denaiAuth.getClient();
    if (!client) return;

    _syncing = true;
    try {
      await _fetchAndMerge(client);
    } catch (e) {
      console.warn('[denaiCloudSync] hydrate failed:', e.message);
      try { if (typeof denaiObserve !== 'undefined') denaiObserve.record('hydrate_failed'); } catch (_e) {}
    } finally {
      _syncing = false;
    }
  }

  // ── Fetch and dispatch ────────────────────────────────────────────────────

  async function _fetchAndMerge(client) {
    // Wave 7G: include notes_enc — separate top-level column, decrypted before merge.
    var res = await client
      .from('patients')
      .select('id, case_num, name, state, history, notes_enc, updated_at, clinic_id')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (res.error) {
      console.warn('[denaiCloudSync] fetch error:', res.error.message);
      return;
    }

    var cloudRows = res.data || [];

    if (cloudRows.length === 0) {
      _handleFirstLogin();
      _lastHydratedAt = new Date().toISOString();
      return;
    }

    // ── Wave 7G: decrypt notes_enc for all cloud rows (async, before merge) ──
    // Builds a map { patientId → decryptedNotesText } used by _buildMerged.
    // If no key (user skipped passphrase) the map is empty — local notes survive.
    var decryptedNotesMap = {};
    if (typeof denaiNotesEnc !== 'undefined' && denaiNotesEnc.hasKey()) {
      for (var di = 0; di < cloudRows.length; di++) {
        var drow = cloudRows[di];
        if (drow && drow.id && drow.notes_enc) {
          var decryptedText = await denaiNotesEnc.decrypt(drow.notes_enc);
          if (decryptedText !== null) {
            decryptedNotesMap[drow.id] = decryptedText;
          }
          // null = wrong key or corrupt — local notes preserved (fallback in _buildMerged)
        }
      }
    }

    // ── Tombstone cleanup ────────────────────────────────────────────────────
    // Local patients absent from the non-deleted cloud set may have been deleted
    // on another device. Query the cloud for their deleted_at timestamps.
    var localList   = _loadLocalPatients() || [];
    var cloudIdSet  = {};
    cloudRows.forEach(function (r) { if (r && r.id) cloudIdSet[r.id] = true; });
    var missingIds  = localList
      .filter(function (p) { return p.id && !cloudIdSet[p.id]; })
      .map(function (p) { return p.id; });

    var tombstones = [];
    if (missingIds.length > 0) {
      tombstones = await _fetchTombstones(client, missingIds);
    }

    _mergeCloudIntoLocal(cloudRows, tombstones, localList, decryptedNotesMap);
    _lastHydratedAt = new Date().toISOString();
  }

  // ── Fetch tombstone metadata for local-only patient IDs ───────────────────
  // Only fetches rows that are already soft-deleted in cloud (deleted_at IS NOT NULL).

  async function _fetchTombstones(client, ids) {
    try {
      var res = await client
        .from('patients')
        .select('id, deleted_at')
        .in('id', ids)
        .not('deleted_at', 'is', null);
      if (res.error) {
        console.warn('[denaiCloudSync] tombstone fetch error:', res.error.message);
        return [];
      }
      return res.data || [];
    } catch (e) {
      console.warn('[denaiCloudSync] tombstone fetch exception:', e.message);
      return [];
    }
  }

  // ── First-login: cloud empty, local has patients ──────────────────────────
  // Queue every non-placeholder patient for upload. One toast, no blocking.

  function _handleFirstLogin() {
    var list = _loadLocalPatients();
    if (!list || list.length === 0) return;

    var queued = 0;
    list.forEach(function (p) {
      if (_isPlaceholder(p)) return; // skip meaningless seed patient
      try {
        if (typeof denaiSyncQueue !== 'undefined') {
          denaiSyncQueue.enqueue({
            type:      'upsert',
            patientId: p.id,
            payload:   p,
            history:   _loadHistory(p.id),
          });
          queued++;
        }
      } catch (e) {}
    });

    if (queued > 0) {
      try {
        var msg = queued === 1
          ? 'Uploading 1 case to your cloud account…'
          : 'Uploading ' + queued + ' cases to your cloud account…';
        if (typeof showToast === 'function') showToast(msg, 'info');
      } catch (e) {}
    }
  }

  // ── Main merge: cloud rows → local patients ───────────────────────────────

  // tombstones:        array of { id, deleted_at } for local patients deleted on cloud.
  // localList:         pre-loaded list (passed from _fetchAndMerge to avoid double read).
  // decryptedNotesMap: { patientId → decryptedNotesText } from Wave 7G decrypt pass.
  function _mergeCloudIntoLocal(cloudRows, tombstones, localList, decryptedNotesMap) {
    localList         = localList || (_loadLocalPatients() || []);
    tombstones        = tombstones || [];
    decryptedNotesMap = decryptedNotesMap || {};
    var mergedList    = localList.slice();
    var changedIds    = [];

    // Index locals by id for fast lookup
    var localById  = {};
    localList.forEach(function (p) { if (p.id) localById[p.id] = p; });

    // Index valid cloud rows (skip malformed rows defensively)
    var cloudById  = {};
    cloudRows.forEach(function (row) {
      if (row && row.id && row.state && typeof row.state === 'object') {
        cloudById[row.id] = row;
      }
    });

    // ── Pass 1: process each valid cloud row ──────────────────────────────
    Object.keys(cloudById).forEach(function (id) {
      var cloudRow = cloudById[id];
      var local    = localById[id];
      var merged   = _mergeOne(local, cloudRow, decryptedNotesMap);

      if (merged === null) return; // malformed — skip

      if (!local) {
        // New patient from cloud — add to local list
        mergedList.push(merged);
        _saveHistory(id, cloudRow.history || []);
        changedIds.push(id);
      } else if (merged !== local) {
        // Cloud was newer — update the existing local entry
        var idx = mergedList.findIndex(function (p) { return p.id === id; });
        if (idx >= 0) {
          mergedList[idx] = merged;
          _saveHistory(id, cloudRow.history || []);
          changedIds.push(id);
        }
      }
      // merged === local → unchanged, no write needed
    });

    // ── Pass 2: local-only patients → enqueue for cloud upload ───────────
    // These were created offline or on this device. Skip placeholder seeds.
    localList.forEach(function (p) {
      if (!p.id || cloudById[p.id]) return; // already in cloud
      if (_isPlaceholder(p)) return;
      try {
        if (typeof denaiSyncQueue !== 'undefined') {
          denaiSyncQueue.enqueue({
            type:      'upsert',
            patientId: p.id,
            payload:   p,
            history:   _loadHistory(p.id),
          });
        }
      } catch (e) {}
    });

    // ── Pass 3: tombstone cleanup ─────────────────────────────────────────────
    // Remove local patients that were soft-deleted on cloud, unless we have
    // unsent local edits (in-flight edit supersedes the cloud delete).
    tombstones.forEach(function (tomb) {
      if (!tomb || !tomb.id || !tomb.deleted_at) return;

      // Guard: unsent local edit on this patient supersedes the cloud delete.
      if (typeof denaiSyncQueue !== 'undefined' && denaiSyncQueue.hasPendingFor(tomb.id)) return;

      var local = localById[tomb.id];
      if (!local) return; // not in local list (already absent)

      // Cloud delete wins only when it's strictly newer than our last sync of this patient.
      var cloudDeleteTs = 0;
      try { cloudDeleteTs = new Date(tomb.deleted_at).getTime(); } catch (e) {}
      var localSyncedTs = 0;
      if (local._syncedAt) { try { localSyncedTs = new Date(local._syncedAt).getTime(); } catch (e) {} }

      if (cloudDeleteTs > localSyncedTs) {
        // Remove from merged list — cloud delete is authoritative.
        mergedList = mergedList.filter(function (p) { return p.id !== tomb.id; });
        changedIds.push(tomb.id); // UI must refresh (patient removed from list)
      }
    });

    if (changedIds.length > 0) {
      _saveLocalPatients(mergedList);
      // Notify inline script to refresh UI (denaiApplyCloudMerge is a function
      // declaration in the inline script, accessible as window.denaiApplyCloudMerge).
      try {
        if (typeof denaiApplyCloudMerge === 'function') {
          denaiApplyCloudMerge(changedIds);
        }
      } catch (e) {
        // Fallback: at least update the sidebar list
        try { if (typeof renderPatientList === 'function') renderPatientList(); } catch (e2) {}
      }
    }
  }

  // ── Merge a single patient ────────────────────────────────────────────────
  // Returns: local (reference, unchanged) | merged (new object) | null (skip)

  function _mergeOne(local, cloudRow, decryptedNotesMap) {
    if (!cloudRow || !cloudRow.id || !cloudRow.state || typeof cloudRow.state !== 'object') {
      return null;
    }

    var cloudState = cloudRow.state;
    var cloudTs    = 0;
    try { cloudTs = new Date(cloudRow.updated_at).getTime(); } catch (e) {}

    if (!local) {
      // New patient from cloud — build from cloud state
      return _buildMerged(cloudState, cloudRow, null, decryptedNotesMap);
    }

    // Guard: unsent local edits take priority — don't overwrite in-flight changes.
    if (typeof denaiSyncQueue !== 'undefined' && denaiSyncQueue.hasPendingFor(local.id)) {
      return local; // unchanged — our unsent changes will become the next cloud truth
    }

    // Compare timestamps: cloud wins only when it's strictly newer than our last sync.
    var localSyncedTs = 0;
    if (local._syncedAt) {
      try { localSyncedTs = new Date(local._syncedAt).getTime(); } catch (e) {}
    }

    if (cloudTs > localSyncedTs) {
      return _buildMerged(cloudState, cloudRow, local, decryptedNotesMap);
    }

    // Local is same age or newer — keep unchanged
    return local;
  }

  // ── Build merged patient object ───────────────────────────────────────────
  // Produces a new object. Never mutates arguments.
  // local (fallback) fields survive for anything cloudState omits (e.g. activeSite).
  // Wave 7G: decryptedNotesMap provides notes when cloud wins and key is available.

  function _buildMerged(cloudState, cloudRow, localFallback, decryptedNotesMap) {
    decryptedNotesMap = decryptedNotesMap || {};
    var out = {};
    if (localFallback) {
      // Copy local fields first (including local notes); cloud fields override below.
      var k;
      for (k in localFallback) {
        if (Object.prototype.hasOwnProperty.call(localFallback, k)) out[k] = localFallback[k];
      }
    }
    // Apply cloud clinical fields (notes/activeSite absent — serializer strips them)
    var k2;
    for (k2 in cloudState) {
      if (Object.prototype.hasOwnProperty.call(cloudState, k2)) out[k2] = cloudState[k2];
    }
    // Stable identity
    out.id       = cloudRow.id;
    out.caseNum  = cloudRow.case_num
                || cloudState.caseNum
                || (localFallback && localFallback.caseNum)
                || '';
    // Record the cloud timestamp so future merges can detect newer cloud versions.
    // _syncedAt is stripped by the serializer and never uploaded to cloud.
    out._syncedAt = cloudRow.updated_at || null;
    // Remove schema_ver from the local object — it's cloud metadata, not patient data.
    delete out.schema_ver;
    // Phase 3.2: propagate clinic_id from typed column → local clinicId field.
    // 'clinic_id' in cloudRow: true for Phase 3.2+ rows (even when null = no clinic).
    // false for rows fetched before Phase 3.2 was deployed — leave local value intact.
    if ('clinic_id' in cloudRow) {
      out.clinicId = cloudRow.clinic_id || null;
    }
    // Wave 7G: apply decrypted notes if available from cloud (overrides local notes copy).
    // If key is absent or decryption failed, local notes from localFallback survive.
    if (decryptedNotesMap[cloudRow.id] !== undefined) {
      out.notes = decryptedNotesMap[cloudRow.id];
    }
    return out;
  }

  // ── Placeholder detection ─────────────────────────────────────────────────
  // Returns true when a patient looks like the auto-generated seed patient on
  // a fresh install: never synced from cloud, default name, no history.
  // Prevents polluting cloud accounts with meaningless placeholder records.

  function _isPlaceholder(p) {
    if (!p || p.name !== DEFAULT_PATIENT_NAME) return false;
    if (p._syncedAt) return false; // has a cloud origin — not a local seed
    var hist = _loadHistory(p.id);
    return !hist || hist.length === 0;
  }

  // ── localStorage helpers ──────────────────────────────────────────────────

  function _loadLocalPatients() {
    try {
      var raw = localStorage.getItem(PATIENTS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) { return null; }
  }

  function _saveLocalPatients(list) {
    try { localStorage.setItem(PATIENTS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function _loadHistory(patientId) {
    try {
      var raw = localStorage.getItem(HISTORY_PREFIX + patientId);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _saveHistory(patientId, historyArr) {
    try {
      var arr = Array.isArray(historyArr) ? historyArr : [];
      localStorage.setItem(HISTORY_PREFIX + patientId, JSON.stringify(arr.slice(-50)));
    } catch (e) {}
  }

  function getLastHydratedAt() { return _lastHydratedAt; }

  return Object.freeze({ hydrate: hydrate, getLastHydratedAt: getLastHydratedAt });

})();
