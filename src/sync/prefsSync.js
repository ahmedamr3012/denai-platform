// src/sync/prefsSync.js
// Wave 7F: Preferences persistence + background cloud sync.
// Wave C1: Extended with toothSystem, currency, pricing (clinic preferences foundation).
//
// LOCAL-FIRST INVARIANT: localStorage is always authoritative.
// init() is synchronous — local prefs apply before any cloud fetch.
// hydrate() is async and non-blocking — cloud failures silently degrade to local.
//
// Storage key: 'denaiPrefs_v1' (JSONB: { darkMode, toothSystem, currency, pricing, _lastSyncedAt })
// Backward compat: falls back to 'dandyDarkMode' on first load if denaiPrefs_v1 absent.
//
// DOM bridge: denaiPrefs cannot directly set `let darkMode` (a const/let in the
// inline script — not on window). Instead it calls window.denaiSetDarkMode(value),
// a function declaration in the inline script that IS accessible via window.*.

window.denaiPrefs = (function () {

  var PREFS_KEY         = 'denaiPrefs_v1';
  var LEGACY_DARK_KEY   = 'dandyDarkMode';
  var PREFS_SCHEMA_VER  = 1;

  // Valid currency codes — avoids a direct dep on clinicPrefs.js's CURRENCY_CONFIG.
  var _VALID_CURRENCIES = ['USD', 'EUR', 'CAD', 'EGP'];

  // Canonical preferences shape — extend here for future preferences.
  // toothSystem, currency, pricing: Wave C1 additions.
  // pricing: null = no clinic overrides set; formatters.js falls back to catalog defaults.
  var _prefs = {
    darkMode:     false,
    notesKeySalt: null, // Wave 7G: PBKDF2 salt (non-sensitive). Stored alongside prefs.
    toothSystem:  'universal', // 'universal' | 'fdi' — display only
    currency:     'USD',       // 'USD' | 'EUR' | 'CAD' | 'EGP' — display only
    pricing:      null,        // { implant, bridge, boneGraft, crown, rct, postCore, annualCheckup }
  };
  // ISO string from the last cloud update_at we received.
  // Used for last-write-wins merge on next hydrate().
  var _lastSyncedAt = null;

  // ── Load from localStorage (synchronous) ─────────────────────────────────
  // Falls back to legacy 'dandyDarkMode' for backward compatibility.

  function _loadLocal() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.darkMode === 'boolean')     _prefs.darkMode     = parsed.darkMode;
          if (typeof parsed.notesKeySalt === 'string')  _prefs.notesKeySalt = parsed.notesKeySalt;
          if (typeof parsed._lastSyncedAt === 'string') _lastSyncedAt       = parsed._lastSyncedAt;
          // Wave C1: clinic preferences
          if (parsed.toothSystem === 'universal' || parsed.toothSystem === 'fdi') _prefs.toothSystem = parsed.toothSystem;
          if (typeof parsed.currency === 'string' && _VALID_CURRENCIES.indexOf(parsed.currency) !== -1) {
            _prefs.currency = parsed.currency;
          }
          if (parsed.pricing && typeof parsed.pricing === 'object') _prefs.pricing = parsed.pricing;
          return; // loaded successfully — skip legacy fallback
        }
      }
    } catch (e) {}
    // Legacy fallback: migrate dandyDarkMode → denaiPrefs_v1
    try {
      var legacyDark = localStorage.getItem(LEGACY_DARK_KEY);
      if (legacyDark !== null) _prefs.darkMode = legacyDark === 'true';
    } catch (e) {}
  }

  // ── Persist to localStorage ────────────────────────────────────────────────

  function _saveLocal() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        darkMode:      _prefs.darkMode,
        notesKeySalt:  _prefs.notesKeySalt,
        toothSystem:   _prefs.toothSystem,   // Wave C1
        currency:      _prefs.currency,       // Wave C1
        pricing:       _prefs.pricing,        // Wave C1 — null or pricing object
        _lastSyncedAt: _lastSyncedAt,
      }));
    } catch (e) {}
  }

  // ── Apply preferences to DOM ──────────────────────────────────────────────
  // Calls window.denaiSetDarkMode if available (function declaration in inline
  // script). Falls back to direct DOM toggle so callers are never blocked.

  function _applyToDom() {
    try {
      if (typeof window.denaiSetDarkMode === 'function') {
        window.denaiSetDarkMode(_prefs.darkMode);
      } else {
        // Fallback: direct DOM manipulation when called before inline script runs
        document.body.classList.toggle('dark', !!_prefs.darkMode);
      }
    } catch (e) {}
  }

  // ── Cloud push ─────────────────────────────────────────────────────────────
  // Debounced 500ms to batch rapid preference changes.

  var _pushTimer = null;

  function _schedulePush() {
    if (_pushTimer) return;
    _pushTimer = setTimeout(function () {
      _pushTimer = null;
      _push();
    }, 500);
  }

  async function _push() {
    try {
      if (typeof denaiAuth === 'undefined' || !denaiAuth.isSignedIn()) return;
      var client = denaiAuth.getClient();
      if (!client) return;
      var session = denaiAuth.getSession();
      if (!session || !session.user) return;

      await client.from('profiles').upsert({
        user_id:     session.user.id,
        preferences: {
          darkMode:     _prefs.darkMode,
          notesKeySalt: _prefs.notesKeySalt,
          toothSystem:  _prefs.toothSystem,  // Wave C1
          currency:     _prefs.currency,      // Wave C1
          pricing:      _prefs.pricing,       // Wave C1
          schema_ver:   PREFS_SCHEMA_VER,
        },
      }, { onConflict: 'user_id' });
    } catch (e) {
      console.warn('[denaiPrefs] push failed:', e.message);
    }
  }

  // ── Cloud hydrate (async, non-blocking) ────────────────────────────────────
  // Fetches cloud preferences from profiles table.
  // Cloud wins only when its updated_at is strictly newer than our last sync.

  // Wave 7G: trigger passphrase prompt if notes encryption salt exists and key not yet set.
  // Called after every hydrate attempt (success or failure) — salt may be local-only.
  function _triggerPassphrasePrompt() {
    if (!_prefs.notesKeySalt) return;
    // If key already derived this session (user already entered passphrase), skip.
    if (typeof denaiNotesEnc !== 'undefined' && denaiNotesEnc.hasKey()) return;
    try {
      if (typeof denaiShowNotesPassphrasePrompt === 'function') {
        denaiShowNotesPassphrasePrompt(_prefs.notesKeySalt);
      }
    } catch (e) {}
  }

  async function hydrate() {
    try {
      if (typeof denaiAuth === 'undefined' || !denaiAuth.isSignedIn()) return;
      var client = denaiAuth.getClient();
      if (!client) return;
      var session = denaiAuth.getSession();
      if (!session || !session.user) return;

      var res = await client
        .from('profiles')
        .select('preferences, updated_at')
        .eq('user_id', session.user.id)
        .single();

      // PGRST116 = no row found (new account, no preferences stored yet)
      if (res.error && res.error.code !== 'PGRST116') {
        console.warn('[denaiPrefs] hydrate error:', res.error.message);
        _triggerPassphrasePrompt();
        return;
      }
      if (!res.data || !res.data.preferences) {
        _triggerPassphrasePrompt();
        return;
      }

      var cloudPrefs = res.data.preferences;
      var cloudTs    = 0;
      try { cloudTs = new Date(res.data.updated_at).getTime(); } catch (e) {}

      var localTs = 0;
      if (_lastSyncedAt) { try { localTs = new Date(_lastSyncedAt).getTime(); } catch (e) {} }

      if (cloudTs > localTs) {
        // Cloud is newer — apply cloud preferences
        if (typeof cloudPrefs.darkMode === 'boolean')    _prefs.darkMode     = cloudPrefs.darkMode;
        if (typeof cloudPrefs.notesKeySalt === 'string') _prefs.notesKeySalt = cloudPrefs.notesKeySalt;
        // Wave C1: clinic preferences from cloud
        if (cloudPrefs.toothSystem === 'universal' || cloudPrefs.toothSystem === 'fdi') _prefs.toothSystem = cloudPrefs.toothSystem;
        if (typeof cloudPrefs.currency === 'string' && _VALID_CURRENCIES.indexOf(cloudPrefs.currency) !== -1) {
          _prefs.currency = cloudPrefs.currency;
        }
        if (cloudPrefs.pricing && typeof cloudPrefs.pricing === 'object') _prefs.pricing = cloudPrefs.pricing;
        _lastSyncedAt = res.data.updated_at;
        _saveLocal();
        _applyToDom();
        // Wave C6: Re-render tooth SVG and monetary displays after cloud prefs apply.
        if (typeof window.denaiRefreshAfterPrefsHydrate === 'function') {
          try { window.denaiRefreshAfterPrefsHydrate(); } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('[denaiPrefs] hydrate failed:', e.message);
    }
    // Trigger passphrase prompt after hydrate attempt (key may now be in local salt).
    _triggerPassphrasePrompt();
  }

  // ── Public: get ────────────────────────────────────────────────────────────

  function get(key) { return _prefs[key]; }

  // ── Public: save ───────────────────────────────────────────────────────────
  // Merge patch into prefs, persist locally, apply to DOM, schedule cloud push.
  // Called by toggleDarkMode() and any future preference change handlers.

  function save(patch) {
    try {
      if (!patch || typeof patch !== 'object') return;
      if (typeof patch.darkMode === 'boolean')    _prefs.darkMode     = patch.darkMode;
      if (typeof patch.notesKeySalt === 'string') _prefs.notesKeySalt = patch.notesKeySalt;
      // Wave C1: clinic preferences
      if (patch.toothSystem === 'universal' || patch.toothSystem === 'fdi') _prefs.toothSystem = patch.toothSystem;
      if (typeof patch.currency === 'string' && _VALID_CURRENCIES.indexOf(patch.currency) !== -1) {
        _prefs.currency = patch.currency;
      }
      if (patch.pricing && typeof patch.pricing === 'object') {
        // Merge patch into existing pricing object (partial update support)
        _prefs.pricing = Object.assign({}, _prefs.pricing || {}, patch.pricing);
      }
      _saveLocal();
      _applyToDom();
      _schedulePush();
    } catch (e) {}
  }

  // ── Public: init (synchronous) ────────────────────────────────────────────
  // Load from localStorage and apply immediately.
  // Called from the DOMContentLoaded listener (prefsSync.js is defer-loaded,
  // so init() cannot run inside the inline init() IIFE — denaiPrefs is undefined
  // at that point). Must be called before denaiAuth.init() so that _lastSyncedAt
  // is non-null before hydrate() runs its last-write-wins comparison.

  function init() {
    _loadLocal();
    // Reconcile _prefs.darkMode with live toggle state (denaiDarkMode key after
    // Phase 1.2 migration; falls back to legacy dandyDarkMode on first deploy).
    try {
      var _raw = localStorage.getItem('denaiDarkMode');
      if (_raw === null) _raw = localStorage.getItem(LEGACY_DARK_KEY);
      if (_raw !== null) _prefs.darkMode = _raw === 'true';
    } catch (e) {}
    _applyToDom();
  }

  return Object.freeze({ init: init, get: get, save: save, hydrate: hydrate });

})();
