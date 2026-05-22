// src/auth/authModule.js
// Wave 7B: Auth Foundation — Supabase client + session lifecycle
//
// DESIGN INVARIANT: Auth is ADDITIVE. The app renders from localStorage first.
// denaiAuth.init() is called AFTER render(S) completes. Auth failures NEVER
// break the app — they silently degrade to local mode.
//
// TODO: Pin Supabase CDN to a specific version before production deployment.

window.denaiAuth = (function () {

  var SUPABASE_URL  = 'https://dwvtbumwojzohclzxson.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_uXDrSO7eWF5Yy4YW-L7XBw_ZPpWORNv';

  var _client  = null;
  var _session = null;
  var _status  = 'local'; // 'local' | 'signed-in' | 'reconnecting' | 'error'
  var _email   = null;

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }

  // ── Status indicator ──────────────────────────────────────────────────────
  // Updates the 8px dot in the sidebar-user footer and the user name/plan text.
  // Safe to call before DOM is ready — element checks guard all writes.
  function _setStatus(status, email) {
    _status = status;
    _email  = email || null;
    _renderIndicator();
    _renderSidebarUser();
  }

  function _renderIndicator() {
    var dot = _el('authStatusIndicator');
    if (!dot) return;
    if (_status === 'signed-in') {
      dot.style.background = '#22c55e';
      dot.title = _email || 'Signed in';
    } else if (_status === 'reconnecting') {
      dot.style.background = '#f59e0b';
      dot.title = 'Reconnecting…';
    } else if (_status === 'error') {
      dot.style.background = '#ef4444';
      dot.title = 'Auth error — working offline';
    } else {
      dot.style.background = 'rgba(255,255,255,0.2)';
      dot.title = 'Local-only mode';
    }
  }

  function _renderSidebarUser() {
    var nameEl = _el('authUserName');
    var planEl = _el('authUserPlan');
    if (!nameEl || !planEl) return;
    if (_status === 'signed-in' && _email) {
      nameEl.textContent = _email.split('@')[0];
      planEl.textContent = '☁ Cloud sync active';
    } else if (_status === 'reconnecting') {
      nameEl.textContent = 'Reconnecting…';
      planEl.textContent = '';
    } else {
      nameEl.textContent = 'Local mode';
      planEl.textContent = 'Local-only mode';
    }
  }

  // ── Supabase client (lazy, one-time init) ─────────────────────────────────
  function _getClient() {
    if (_client) return _client;
    try {
      if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        return null;
      }
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    } catch (e) {
      console.warn('[denaiAuth] client init failed:', e.message);
      return null;
    }
    return _client;
  }

  // ── Session restore (called once, after first render) ─────────────────────
  async function _restoreSession() {
    var client = _getClient();
    if (!client) {
      _setStatus('local');
      return;
    }
    _setStatus('reconnecting');
    try {
      var result = await client.auth.getSession();
      if (result.error) throw result.error;
      if (result.data && result.data.session) {
        _session = result.data.session;
        _setStatus('signed-in', result.data.session.user.email);
        // Wave 7D: flush pending queue on session restore (existing session on app load).
        // onAuthStateChange does not fire for getSession() — must trigger manually.
        setTimeout(function () {
          if (typeof denaiSyncQueue      !== 'undefined') denaiSyncQueue.flush();
          // Wave 7E: hydrate patient data from cloud after session restore.
          if (typeof denaiCloudSync      !== 'undefined') denaiCloudSync.hydrate();
          // Wave 7F: hydrate preferences from cloud after session restore.
          if (typeof denaiPrefs          !== 'undefined') denaiPrefs.hydrate();
          // Phase 3.4: load clinic session context after auth settle.
          if (typeof denaiClinicSession  !== 'undefined') denaiClinicSession.init(client).catch(function () {});
        }, 0);
      } else {
        _session = null;
        _setStatus('local');
      }
    } catch (e) {
      console.warn('[denaiAuth] session restore failed:', e.message);
      _session = null;
      _setStatus('local'); // Always degrade gracefully — never block app
    }
  }

  // ── Auth state listener (token refresh, sign-out from another tab) ────────
  function _listenAuthChanges() {
    var client = _getClient();
    if (!client) return;
    client.auth.onAuthStateChange(function (event, session) {
      _session = session;
      if (session) {
        _setStatus('signed-in', session.user.email);
        // INITIAL_SESSION fires once at listener registration when an existing session is
        // present. _restoreSession() already handled this session via getSession() and
        // scheduled hydrate/flush — skipping here prevents a redundant double-trigger.
        if (event === 'INITIAL_SESSION') return;
        // Wave 7D: flush any queued writes now that the session is confirmed.
        // Wave 7E: hydrate patient data from cloud on sign-in / token refresh.
        setTimeout(function () {
          if (typeof denaiSyncQueue      !== 'undefined') denaiSyncQueue.flush();
          if (typeof denaiCloudSync      !== 'undefined') denaiCloudSync.hydrate();
          // Wave 7F: hydrate preferences from cloud on sign-in.
          if (typeof denaiPrefs          !== 'undefined') denaiPrefs.hydrate();
          // Phase 3.4: load clinic session context (idempotent — skips on token refresh).
          if (typeof denaiClinicSession  !== 'undefined') denaiClinicSession.init(_getClient()).catch(function () {});
        }, 0);
      } else {
        _setStatus('local');
        // Wave 7G: clear encryption key and reset prompt flag on sign-out.
        // Key is per-session only — never persisted.
        try { if (typeof denaiNotesEnc      !== 'undefined') denaiNotesEnc.clearKey(); } catch (e) {}
        try { if (typeof denaiResetNotesPrompt === 'function') denaiResetNotesPrompt(); } catch (e) {}
        // Phase 3.4: clear clinic session so next sign-in triggers a clean re-init.
        try { if (typeof denaiClinicSession !== 'undefined') denaiClinicSession.clear(); } catch (e) {}
        // Phase 5: abandon pending queue ops — they belong to the previous user and
        // must not be flushed under a different user's identity on the next sign-in.
        try { if (typeof denaiSyncQueue !== 'undefined') denaiSyncQueue.abandonQueue(); } catch (e) {}
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // init() — call AFTER render(S). Never blocks startup.
  async function init() {
    _renderIndicator();
    _renderSidebarUser();
    await _restoreSession();
    _listenAuthChanges();
  }

  async function signIn(email, password) {
    var client = _getClient();
    if (!client) return { error: { message: 'Auth service unavailable — check credentials in authModule.js' } };
    try {
      var result = await client.auth.signInWithPassword({ email: email, password: password });
      if (!result.error && result.data && result.data.session) {
        _session = result.data.session;
        _setStatus('signed-in', result.data.session.user.email);
      }
      return result;
    } catch (e) {
      return { error: { message: e.message || 'Sign in failed' } };
    }
  }

  async function signUp(email, password) {
    var client = _getClient();
    if (!client) return { error: { message: 'Auth service unavailable — check credentials in authModule.js' } };
    try {
      return await client.auth.signUp({ email: email, password: password });
    } catch (e) {
      return { error: { message: e.message || 'Sign up failed' } };
    }
  }

  // IMPORTANT: Logout clears auth tokens ONLY. Local patient data is never touched.
  async function signOut() {
    var client = _getClient();
    if (client) {
      try { await client.auth.signOut(); } catch (e) { /* ignore */ }
    }
    _session = null;
    _setStatus('local');
    // Wave 7G: clear encryption key on sign-out (key is per-session only).
    // onAuthStateChange will also fire and call clearKey — this is safe to call twice.
    try { if (typeof denaiNotesEnc      !== 'undefined') denaiNotesEnc.clearKey(); } catch (e) {}
    try { if (typeof denaiResetNotesPrompt === 'function') denaiResetNotesPrompt(); } catch (e) {}
    // Phase 3.4: clear clinic session (idempotent — onAuthStateChange also calls this).
    try { if (typeof denaiClinicSession !== 'undefined') denaiClinicSession.clear(); } catch (e) {}
    // Phase 5: abandon pending queue ops eagerly. Belt-and-suspenders with the
    // onAuthStateChange else-branch call — covers the case where the SIGNED_OUT event
    // does not fire (e.g. Supabase CDN unavailable). idempotent if queue already empty.
    try { if (typeof denaiSyncQueue !== 'undefined') denaiSyncQueue.abandonQueue(); } catch (e) {}
  }

  function getSession()  { return _session; }
  function getStatus()   { return _status; }
  function isSignedIn()  { return _status === 'signed-in' && _session !== null; }
  // Wave 7D: expose the Supabase client for database operations (syncQueue).
  // Returns null if client init has failed (placeholder credentials, CDN unavailable).
  function getClient()   { return _getClient(); }

  return Object.freeze({
    init: init,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getSession: getSession,
    getStatus: getStatus,
    isSignedIn: isSignedIn,
    getClient: getClient,
  });

})();
