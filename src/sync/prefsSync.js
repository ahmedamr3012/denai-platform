// src/sync/prefsSync.js
// Wave 7F: Preferences persistence + background cloud sync.
//
// LOCAL-FIRST INVARIANT: localStorage is always authoritative.
// init() is synchronous — local prefs apply before any cloud fetch.
// hydrate() is async and non-blocking — cloud failures silently degrade to local.
//
// Storage key: 'denaiPrefs_v1' (JSONB: { darkMode, _lastSyncedAt })
// Backward compat: falls back to 'dandyDarkMode' on first load if denaiPrefs_v1 absent.
//
// DOM bridge: denaiPrefs cannot directly set `let darkMode` (a const/let in the
// inline script — not on window). Instead it calls window.denaiSetDarkMode(value),
// a function declaration in the inline script that IS accessible via window.*.

window.denaiPrefs = (function () {

  var PREFS_KEY         = 'denaiPrefs_v1';
  var LEGACY_DARK_KEY   = 'dandyDarkMode';
  var PREFS_SCHEMA_VER  = 1;

  // Canonical preferences shape — extend here for future preferences.
  var _prefs = {
    darkMode:     false,
    notesKeySalt: null, // Wave 7G: PBKDF2 salt (non-sensitive). Stored alongside prefs.
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
          if (typeof parsed.darkMode === 'boolean')    _prefs.darkMode     = parsed.darkMode;
          if (typeof parsed.notesKeySalt === 'string') _prefs.notesKeySalt = parsed.notesKeySalt;
          if (typeof parsed._lastSyncedAt === 'string') _lastSyncedAt = parsed._lastSyncedAt;
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
        _lastSyncedAt = res.data.updated_at;
        _saveLocal();
        _applyToDom();
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
      _saveLocal();
      _applyToDom();
      _schedulePush();
    } catch (e) {}
  }

  // ── Public: init (synchronous) ────────────────────────────────────────────
  // Load from localStorage and apply immediately.
  // Called from the app's (function init(){})() before applyDarkMode().

  function init() {
    _loadLocal();
    _applyToDom();
  }

  return Object.freeze({ init: init, get: get, save: save, hydrate: hydrate });

})();
