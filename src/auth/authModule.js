// src/auth/authModule.js
// Wave 7B: Auth Foundation — Supabase client + session lifecycle
//
// DESIGN INVARIANT: Auth is ADDITIVE. The app renders from localStorage first.
// denaiAuth.init() is called AFTER render(S) completes. Auth failures NEVER
// break the app — they silently degrade to local mode.
//
// NOTE: Supabase CDN is pinned to @2.39.7 in index.html (resolved Wave B1).

window.denaiAuth = (function () {

  var SUPABASE_URL  = 'https://dwwtbumwojzohclzxson.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_uXDrSO7eWF5Yy4YW-L7XBw_ZPpWORNv';

  var _client    = null;
  var _session   = null;
  var _status    = 'local'; // 'local' | 'signed-in' | 'reconnecting' | 'error'
  var _email     = null;
  var _cdnWarned = false;

  // ── Wave B1: auth event trail (in-memory ring, max 30 entries) ────────────
  // Production diagnosis aid: denaiAuth.getAuthTrail() in the console shows
  // the full auth lifecycle for this page load. No network, no persistence.
  var _trail = [];
  function _logEvent(evt, detail) {
    _trail.push({ t: new Date().toISOString(), e: evt, d: detail });
    if (_trail.length > 30) _trail.shift();
  }

  // ── bug-169: status-change subscribers ────────────────────────────────────
  // Lets UI surfaces outside the sidebar (e.g. the dashboard footer) react to
  // async auth transitions instead of relying solely on their own render
  // timing, which can run before _restoreSession() resolves and never run
  // again afterward.
  var _statusSubscribers = [];
  function onStatusChange(callback) {
    if (typeof callback !== 'function') return function () {};
    _statusSubscribers.push(callback);
    return function unsubscribe() {
      var i = _statusSubscribers.indexOf(callback);
      if (i !== -1) _statusSubscribers.splice(i, 1);
    };
  }
  function _notifyStatusSubscribers() {
    _statusSubscribers.forEach(function (cb) {
      try { cb(_status, _email); } catch (e) {
        console.warn('[denaiAuth] status subscriber failed:', e && e.message);
      }
    });
  }

  // ── Wave B1: post-auth task isolation ─────────────────────────────────────
  // Each settle task (queue flush, hydrate, clinic init, …) is isolated so one
  // failing task — sync throw or async rejection — cannot prevent the
  // remaining tasks from running and cannot become an unhandled rejection.
  function _runTask(name, fn) {
    try {
      var r = fn();
      if (r && typeof r.catch === 'function') {
        r.catch(function (e) {
          _logEvent('task-failed:' + name, e && e.message);
          console.warn('[denaiAuth] post-auth task failed (' + name + '):', e && e.message);
        });
      }
    } catch (e) {
      _logEvent('task-failed:' + name, e && e.message);
      console.warn('[denaiAuth] post-auth task failed (' + name + '):', e && e.message);
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }

  // ── Status indicator ──────────────────────────────────────────────────────
  // Updates the 8px dot in the sidebar-user footer and the user name/plan text.
  // Safe to call before DOM is ready — element checks guard all writes.
  function _setStatus(status, email) {
    if (status !== _status) _logEvent('status:' + status);
    _status = status;
    _email  = email || null;
    _renderIndicator();
    _renderSidebarUser();
    _notifyStatusSubscribers();
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
      // B2C: the subscription presenter owns the plan line when state is
      // presentable (trial countdown, restricted notice). Presentation only —
      // auth lifecycle is untouched; default copy when nothing to present.
      var subLine = null;
      try { if (typeof denaiSubPresenter !== 'undefined') subLine = denaiSubPresenter.sidebarLine(); } catch (e) {}
      planEl.textContent = subLine || '☁ Cloud sync active';
    } else if (_status === 'reconnecting') {
      nameEl.textContent = 'Reconnecting…';
      planEl.textContent = '';
    } else {
      nameEl.textContent = 'Local mode';
      planEl.textContent = 'Cases save to this device';
    }
  }

  // ── Supabase client (lazy, one-time init) ─────────────────────────────────
  function _getClient() {
    if (_client) return _client;
    try {
      if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        // Wave B1: warn once — a blocked/down CDN must be diagnosable, not silent.
        if (!_cdnWarned) {
          _cdnWarned = true;
          _logEvent('client:cdn-missing');
          console.warn('[denaiAuth] Supabase library not loaded — running local-only (CDN blocked or offline)');
        }
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
      // Wave B1: getSession() is raced against a 10s timeout. Without this,
      // a hung getSession (e.g. auth lock contention in supabase-js) would
      // strand the app in 'reconnecting' forever — a ghost state with no exit.
      var result = await Promise.race([
        client.auth.getSession(),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ __timeout: true }); }, 10000);
        })
      ]);
      if (result && result.__timeout) {
        console.warn('[denaiAuth] getSession() timed out after 10s — degrading to local mode');
        _logEvent('restore:timeout');
        _session = null;
        _setStatus('local');
        return;
      }
      if (result.error) throw result.error;
      if (result.data && result.data.session) {
        _session = result.data.session;
        _setStatus('signed-in', result.data.session.user.email);
        // Wave 7D: flush pending queue on session restore (existing session on app load).
        // onAuthStateChange does not fire for getSession() — must trigger manually.
        // Wave B1: each task isolated via _runTask — one failure cannot skip the rest.
        setTimeout(function () {
          if (typeof denaiSyncQueue      !== 'undefined') _runTask('queue-flush',   function () { return denaiSyncQueue.flush(); });
          // Wave 7E: hydrate patient data from cloud after session restore.
          if (typeof denaiCloudSync      !== 'undefined') _runTask('cloud-hydrate', function () { return denaiCloudSync.hydrate(); });
          // Wave 7F: hydrate preferences from cloud after session restore.
          if (typeof denaiPrefs          !== 'undefined') _runTask('prefs-hydrate', function () { return denaiPrefs.hydrate(); });
          // Phase 3.4: load clinic session context after auth settle.
          if (typeof denaiClinicSession  !== 'undefined') _runTask('clinic-init',   function () { return denaiClinicSession.init(client); });
          // Phase 8: upload buffered friction observations now that we have a client.
          if (typeof denaiObserve        !== 'undefined') _runTask('observe-flush', function () { return denaiObserve.flush(_getClient()); });
        }, 0);
      } else {
        _session = null;
        _setStatus('local');
      }
    } catch (e) {
      console.warn('[denaiAuth] session restore failed:', e.message);
      _logEvent('restore:failed', e && e.message);
      _session = null;
      _setStatus('local'); // Always degrade gracefully — never block app
    }
  }

  // ── Auth state listener (token refresh, sign-out from another tab) ────────
  function _listenAuthChanges() {
    var client = _getClient();
    if (!client) return;
    client.auth.onAuthStateChange(function (event, session) {
      _logEvent('auth-event:' + event);
      _session = session;
      if (session) {
        _setStatus('signed-in', session.user.email);
        // INITIAL_SESSION fires once at listener registration when an existing session is
        // present. _restoreSession() already handled this session via getSession() and
        // scheduled hydrate/flush — skipping here prevents a redundant double-trigger.
        if (event === 'INITIAL_SESSION') return;
        // Wave 7D: flush any queued writes now that the session is confirmed.
        // Wave 7E: hydrate patient data from cloud on sign-in / token refresh.
        // Wave B1: each task isolated via _runTask — one failure cannot skip the rest.
        setTimeout(function () {
          if (typeof denaiSyncQueue      !== 'undefined') _runTask('queue-flush',   function () { return denaiSyncQueue.flush(); });
          if (typeof denaiCloudSync      !== 'undefined') _runTask('cloud-hydrate', function () { return denaiCloudSync.hydrate(); });
          // Wave 7F: hydrate preferences from cloud on sign-in.
          if (typeof denaiPrefs          !== 'undefined') _runTask('prefs-hydrate', function () { return denaiPrefs.hydrate(); });
          // Phase 3.4: load clinic session context (idempotent — skips on token refresh).
          if (typeof denaiClinicSession  !== 'undefined') _runTask('clinic-init',   function () { return denaiClinicSession.init(_getClient()); });
          // Phase 8: upload buffered friction observations on sign-in / token refresh.
          if (typeof denaiObserve        !== 'undefined') _runTask('observe-flush', function () { return denaiObserve.flush(_getClient()); });
        }, 0);
      } else {
        _setStatus('local');
        // Wave 7G: clear encryption key and reset prompt flag on sign-out.
        // Key is per-session only — never persisted.
        try { if (typeof denaiNotesEnc      !== 'undefined') denaiNotesEnc.clearKey(); } catch (e) {}
        try { if (typeof denaiResetNotesPrompt === 'function') denaiResetNotesPrompt(); } catch (e) {}
        // Phase 3.4: clear clinic session so next sign-in triggers a clean re-init.
        // Phase 13: clinicSession.clear() also calls denaiEntitlements.clear().
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
    // Wave B1: operational message — the old copy referenced a source file.
    if (!client) return { error: { message: 'Cloud service unavailable — working in local mode. Check your connection and reload to try again.' } };
    try {
      var result = await client.auth.signInWithPassword({ email: email, password: password });
      _logEvent(result.error ? 'signin:error' : 'signin:ok', result.error && result.error.message);
      if (!result.error && result.data && result.data.session) {
        _session = result.data.session;
        _setStatus('signed-in', result.data.session.user.email);
      }
      return result;
    } catch (e) {
      _logEvent('signin:exception', e && e.message);
      return { error: { message: e.message || 'Sign in failed' } };
    }
  }

  async function signUp(email, password) {
    var client = _getClient();
    if (!client) return { error: { message: 'Cloud service unavailable — working in local mode. Check your connection and reload to try again.' } };
    try {
      var result = await client.auth.signUp({ email: email, password: password });
      _logEvent(result.error ? 'signup:error' : 'signup:ok', result.error && result.error.message);
      return result;
    } catch (e) {
      _logEvent('signup:exception', e && e.message);
      return { error: { message: e.message || 'Sign up failed' } };
    }
  }

  // IMPORTANT: Logout clears auth tokens ONLY. Local patient data is never touched.
  async function signOut() {
    _logEvent('signout');
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
    // Phase 13: clinicSession.clear() also calls denaiEntitlements.clear().
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
  // Wave B1: read-only copy of the auth event trail for production diagnosis.
  function getAuthTrail() { return _trail.slice(); }

  return Object.freeze({
    init: init,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getSession: getSession,
    getStatus: getStatus,
    isSignedIn: isSignedIn,
    getClient: getClient,
    getAuthTrail: getAuthTrail,
    onStatusChange: onStatusChange,
  });

})();
