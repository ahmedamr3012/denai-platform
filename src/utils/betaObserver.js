// Beta observation layer — passive, zero render impact.
// Captures runtime errors and session events; provides health snapshot API.
// No PHI. No network. No DOM interaction. Reversible: remove script tag to disable.
const denaiObserver = (function () {
  'use strict';

  var _sessionStart = Date.now();
  var _errors       = [];
  var _events       = [];
  var MAX_ERRORS    = 50;
  var MAX_EVENTS    = 200;

  function _ts() { return new Date().toISOString(); }

  // ── Error capture ──────────────────────────────────────────────────────────

  function logError(msg, source, line, col, err) {
    if (_errors.length >= MAX_ERRORS) _errors.shift();
    _errors.push({
      ts:     _ts(),
      msg:    String(msg || '').slice(0, 300),
      source: String(source || '').split('/').pop().split('?')[0],
      line:   line || 0,
      stack:  err && err.stack ? String(err.stack).slice(0, 600) : null,
    });
  }

  // ── Event log ─────────────────────────────────────────────────────────────

  function logEvent(type, meta) {
    if (_events.length >= MAX_EVENTS) _events.shift();
    _events.push({
      ts:   _ts(),
      type: String(type || '').slice(0, 60),
      meta: (meta !== undefined && meta !== null) ? meta : null,
    });
  }

  // ── Storage pressure ──────────────────────────────────────────────────────

  function getStoragePressure() {
    try {
      var bytes = 0;
      var ls = localStorage;
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i) || '';
        bytes += k.length + (ls.getItem(k) || '').length;
      }
      var QUOTA = 5 * 1024 * 1024; // browser localStorage quota ~5 MB
      return { bytes: bytes, quota: QUOTA, pct: Math.round((bytes / QUOTA) * 100) };
    } catch (e) {
      return { bytes: 0, quota: 5242880, pct: 0 };
    }
  }

  // ── Session health snapshot ────────────────────────────────────────────────

  function getSessionHealth() {
    return {
      uptimeMs:        Date.now() - _sessionStart,
      errorCount:      _errors.length,
      eventCount:      _events.length,
      storagePressure: getStoragePressure(),
    };
  }

  function getRecentErrors(n) { return _errors.slice(-(n || 10)); }
  function getEventLog(n)     { return _events.slice(-(n || 20)); }

  // ── Wire global error capture ──────────────────────────────────────────────
  // Chain onto any existing onerror rather than replacing it.

  var _prevOnerror = window.onerror;
  window.onerror = function (msg, src, line, col, err) {
    logError(msg, src, line, col, err);
    return _prevOnerror ? _prevOnerror.apply(this, arguments) : false;
  };

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    logError(
      r && r.message ? r.message : 'Unhandled Promise rejection',
      'promise', 0, 0,
      r instanceof Error ? r : null
    );
  });

  logEvent('observer_init');

  return Object.freeze({
    logEvent:           logEvent,
    logError:           logError,
    getStoragePressure: getStoragePressure,
    getSessionHealth:   getSessionHealth,
    getRecentErrors:    getRecentErrors,
    getEventLog:        getEventLog,
  });

}());
