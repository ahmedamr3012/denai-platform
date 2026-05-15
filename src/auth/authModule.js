// src/auth/authModule.js
// Wave 7B: Auth Foundation — Supabase client + session lifecycle
//
// DESIGN INVARIANT: Auth is ADDITIVE. The app renders from localStorage first.
// denaiAuth.init() is called AFTER render(S) completes. Auth failures NEVER
// break the app — they silently degrade to local mode.
//
// TODO: Replace placeholder credentials with real Supabase project values.
// TODO: Pin Supabase CDN to a specific version before production deployment.

window.denaiAuth = (function () {

  // TODO: Replace with actual Supabase project URL and anon key.
  // These placeholders cause client init to fail gracefully → local mode.
  var SUPABASE_URL  = 'https://placeholder.supabase.co'; // TODO: replace
  var SUPABASE_ANON = 'placeholder-anon-key';            // TODO: replace

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
      dot.title = 'Local mode — sign in to sync';
    }
  }

  function _renderSidebarUser() {
    var nameEl = _el('authUserName');
    var planEl = _el('authUserPlan');
    if (!nameEl || !planEl) return;
    if (_status === 'signed-in' && _email) {
      nameEl.textContent = _email.split('@')[0];
      planEl.textContent = '☁ Synced';
    } else if (_status === 'reconnecting') {
      nameEl.textContent = 'Reconnecting…';
      planEl.textContent = '';
    } else {
      nameEl.textContent = 'Local mode';
      planEl.textContent = 'Sign in to sync';
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
          if (typeof denaiSyncQueue   !== 'undefined') denaiSyncQueue.flush();
          // Wave 7E: hydrate patient data from cloud after session restore.
          if (typeof denaiCloudSync   !== 'undefined') denaiCloudSync.hydrate();
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
        // Wave 7D: flush any queued writes now that the session is confirmed.
        // Wave 7E: hydrate patient data from cloud on sign-in / token refresh.
        setTimeout(function () {
          if (typeof denaiSyncQueue   !== 'undefined') denaiSyncQueue.flush();
          if (typeof denaiCloudSync   !== 'undefined') denaiCloudSync.hydrate();
        }, 0);
      } else {
        _setStatus('local');
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
