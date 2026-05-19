// Dev-only diagnostics panel — toggle with Ctrl+Shift+D.
// Reads from denaiObserver + deferred sync/auth modules (lazy, guarded).
// No PHI exposed. No network. Removable: delete script tag to disable.
(function () {
  'use strict';

  var _open         = false;
  var _panel        = null;
  var _refreshTimer = null;

  // ── Formatting helpers ─────────────────────────────────────────────────────

  function _fmtUptime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    return h + ':' + _pad(m % 60) + ':' + _pad(s % 60);
  }

  function _pad(n) { return n < 10 ? '0' + n : String(n); }

  function _fmtBytes(b) {
    if (b < 1024)    return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function _fmtTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString(); } catch (e) { return String(iso); }
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Safe reads from defer-loaded modules (guarded by typeof) ──────────────

  function _syncInfo() {
    var out = { qLen: '—', qStatus: '—', lastUp: null, lastDown: null, authStatus: '—' };
    try {
      if (typeof denaiSyncQueue !== 'undefined') {
        out.qLen    = denaiSyncQueue.getQueueLength();
        out.qStatus = denaiSyncQueue.getStatus() || '—';
        out.lastUp  = denaiSyncQueue.getLastSyncedAt();
      }
      if (typeof denaiCloudSync !== 'undefined') {
        out.lastDown = denaiCloudSync.getLastHydratedAt();
      }
      if (typeof denaiAuth !== 'undefined') {
        out.authStatus = denaiAuth.isSignedIn() ? 'signed-in' : 'local';
      }
    } catch (e) { /* ignore — module may not be ready */ }
    return out;
  }

  // Read last-accessed timestamp and patient count from localStorage directly.
  // Key names are stable project constants (storageKeys.js).
  function _storageSnapshot() {
    var out = { lastSave: null, patientCount: '—' };
    try {
      var raw = localStorage.getItem('dandyState_v1');
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.lastAccessed) out.lastSave = s.lastAccessed;
      }
    } catch (e) { /* ignore */ }
    try {
      var pts = localStorage.getItem('dandyPatients_v1');
      if (pts) {
        var arr = JSON.parse(pts);
        if (Array.isArray(arr)) out.patientCount = arr.length;
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  // ── Panel rendering ────────────────────────────────────────────────────────

  function _render() {
    if (!_panel) return;
    var body = _panel.querySelector('#dp-body');
    if (!body) return;

    var obs    = typeof denaiObserver !== 'undefined' ? denaiObserver : null;
    var health = obs ? obs.getSessionHealth() : null;
    var errors = obs ? obs.getRecentErrors(6) : [];
    var events = obs ? obs.getEventLog(10)    : [];
    var sp     = health ? health.storagePressure : { bytes: 0, pct: 0 };
    var sync   = _syncInfo();
    var snap   = _storageSnapshot();

    var errHtml = errors.length === 0
      ? '<div class="dp-row"><span class="dp-ok">No errors captured</span></div>'
      : errors.map(function (e) {
          return '<div class="dp-err-row">' +
            '<span class="dp-ts">' + _fmtTime(e.ts) + '</span>' +
            '<span class="dp-err-msg">' + _esc(e.msg) + (e.source ? ' [' + _esc(e.source) + ':' + e.line + ']' : '') + '</span>' +
          '</div>';
        }).join('');

    var evHtml = events.length === 0
      ? '<div class="dp-row"><span class="dp-dim">No events logged yet</span></div>'
      : events.map(function (e) {
          return '<div class="dp-row">' +
            '<span class="dp-ts">' + _fmtTime(e.ts) + '</span>' +
            '<span>' + _esc(e.type) + '</span>' +
          '</div>';
        }).join('');

    body.innerHTML =
      '<div class="dp-section">' +
        '<div class="dp-label">Session</div>' +
        '<div class="dp-row"><span>Uptime</span><span>' + (health ? _fmtUptime(health.uptimeMs) : '—') + '</span></div>' +
        '<div class="dp-row"><span>Auth</span><span>' + _esc(sync.authStatus) + '</span></div>' +
        '<div class="dp-row"><span>Patients</span><span>' + _esc(snap.patientCount) + '</span></div>' +
        '<div class="dp-row"><span>Last save</span><span>' + _fmtTime(snap.lastSave) + '</span></div>' +
        '<div class="dp-row"><span>Errors</span><span class="' + (health && health.errorCount > 0 ? 'dp-warn' : 'dp-ok') + '">' + (health ? health.errorCount : '—') + '</span></div>' +
      '</div>' +
      '<div class="dp-section">' +
        '<div class="dp-label">Storage</div>' +
        '<div class="dp-row"><span>Used</span><span class="' + (sp.pct > 75 ? 'dp-warn' : '') + '">' + _fmtBytes(sp.bytes) + ' (' + sp.pct + '%)</span></div>' +
      '</div>' +
      '<div class="dp-section">' +
        '<div class="dp-label">Cloud Sync</div>' +
        '<div class="dp-row"><span>Queue</span><span>' + _esc(sync.qLen) + ' / ' + _esc(sync.qStatus) + '</span></div>' +
        '<div class="dp-row"><span>Last upload</span><span>' + _fmtTime(sync.lastUp) + '</span></div>' +
        '<div class="dp-row"><span>Last hydrate</span><span>' + _fmtTime(sync.lastDown) + '</span></div>' +
      '</div>' +
      '<div class="dp-section">' +
        '<div class="dp-label">Errors (' + errors.length + ')</div>' +
        errHtml +
      '</div>' +
      '<div class="dp-section">' +
        '<div class="dp-label">Event Log</div>' +
        evHtml +
      '</div>';
  }

  // ── Panel creation (lazy — first invocation only) ──────────────────────────

  function _create() {
    if (_panel) return;

    _panel = document.createElement('div');
    _panel.id = 'denaiDiagPanel';
    _panel.setAttribute('aria-hidden', 'true');
    _panel.setAttribute('role', 'complementary');

    var header    = document.createElement('div');
    header.className = 'dp-header';

    var title = document.createElement('span');
    title.textContent = 'denai \xb7 diagnostics';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'dp-close';
    closeBtn.setAttribute('aria-label', 'Close diagnostics panel');
    closeBtn.textContent = '\xd7';
    closeBtn.addEventListener('click', hide);

    header.appendChild(title);
    header.appendChild(closeBtn);

    var dpBody = document.createElement('div');
    dpBody.id        = 'dp-body';
    dpBody.className = 'dp-body';

    var footer = document.createElement('div');
    footer.className = 'dp-footer';
    footer.textContent = 'Ctrl+Shift+D to toggle \xb7 beta dev only';

    _panel.appendChild(header);
    _panel.appendChild(dpBody);
    _panel.appendChild(footer);
    document.body.appendChild(_panel);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function show() {
    _create();
    _panel.classList.add('dp-visible');
    _open = true;
    _render();
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(_render, 2000);
    if (typeof denaiObserver !== 'undefined') denaiObserver.logEvent('diag_panel_opened');
  }

  function hide() {
    if (_panel) _panel.classList.remove('dp-visible');
    clearInterval(_refreshTimer);
    _refreshTimer = null;
    _open = false;
    if (typeof denaiObserver !== 'undefined') denaiObserver.logEvent('diag_panel_closed');
  }

  function toggle() { _open ? hide() : show(); }

  // ── Keyboard shortcut: Ctrl+Shift+D ───────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      toggle();
    }
  });

  window.denaiDiagPanel = { show: show, hide: hide, toggle: toggle };

}());
