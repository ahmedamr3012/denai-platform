// src/observe/frictionLog.js
// Phase 8: Lightweight workflow friction observation.
// Local-first ring buffer — no PHI, no user linkage, never blocks.
// Records non-identifying operational signals for clinical friction analysis.
//
// PRIVACY CONTRACT:
//   - event_type is drawn from a closed allowlist (no free text, no PHI)
//   - flags accepts ONLY boolean/numeric values (strings are silently dropped)
//   - session_id is a per-page-load random UUID — not linked to auth.users
//   - flush() uploads to workflow_observations (INSERT-only, no SELECT from client)
//
// USAGE: denaiObserve.record('sync_error') — that's it. Always silent, never throws.

window.denaiObserve = (function () {
  'use strict';

  var BUFFER_KEY = 'denaiFrictionLog_v1';
  var MAX_EVENTS = 200;

  // Per-page-load ephemeral session ID — non-identifying, cleared on page reload.
  var _sessionId = (function () {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  })();

  // Closed allowlist: only these behavioral signals are accepted.
  // No free text event types — prevents accidental PHI leakage.
  var ALLOWED_TYPES = {
    sync_error:               true,
    sync_stalled:             true,
    sync_partial:             true,
    hydrate_failed:           true,
    offline_detected:         true,
    online_restored:          true,
    session_restore_fail:     true,
    ai_panel_open:            true,
    ai_panel_close_fast:      true,  // flags: { duration_ms }
    patient_create_abandoned: true,
    modal_abandoned:          true,
    save_error:               true,
    clinic_context_missing:   true,
  };

  var _buffer = null;  // lazy-loaded array

  function _load() {
    if (_buffer !== null) return _buffer;
    try {
      var raw = localStorage.getItem(BUFFER_KEY);
      _buffer = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(_buffer)) _buffer = [];
    } catch (e) { _buffer = []; }
    return _buffer;
  }

  function _persist() {
    try {
      var b = _load();
      if (b.length > MAX_EVENTS) _buffer = b.slice(b.length - MAX_EVENTS);
      localStorage.setItem(BUFFER_KEY, JSON.stringify(_buffer || []));
    } catch (e) {}
  }

  // ── Public: record ────────────────────────────────────────────────────────
  // Main API. Only allowlisted types are accepted. Always silent, never throws.

  function record(eventType, flags) {
    try {
      if (!ALLOWED_TYPES[eventType]) return;
      var entry = { t: eventType, ts: Date.now(), s: _sessionId };
      if (flags && typeof flags === 'object') {
        var safe = {};
        Object.keys(flags).forEach(function (k) {
          var v = flags[k];
          if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
          // Strings silently dropped — PHI guard
        });
        if (Object.keys(safe).length > 0) entry.f = safe;
      }
      _load().push(entry);
      _persist();
    } catch (e) {}
  }

  // ── Public: getBuffer ─────────────────────────────────────────────────────
  // Returns a snapshot of the current local buffer. For operational diagnostics.

  function getBuffer() {
    return _load().slice();
  }

  // ── Public: flush ─────────────────────────────────────────────────────────
  // Silent best-effort upload to Supabase workflow_observations table.
  // Never blocks. Clears local buffer only on confirmed successful upload.
  // Call after auth sign-in or connectivity restore.

  function flush(supabaseClient) {
    try {
      if (!supabaseClient) return;
      var buf = _load();
      if (buf.length === 0) return;
      var rows = buf.map(function (e) {
        return {
          session_id:  e.s,
          event_type:  e.t,
          flags:       e.f || null,
          occurred_at: new Date(e.ts).toISOString(),
        };
      });
      supabaseClient
        .from('workflow_observations')
        .insert(rows)
        .then(function (res) {
          if (!res.error) {
            _buffer = [];
            _persist();
          }
        })
        .catch(function () {});  // Silent failure — local buffer retained for next attempt
    } catch (e) {}
  }

  return Object.freeze({ record: record, getBuffer: getBuffer, flush: flush });

})();
