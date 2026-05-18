// src/sync/syncQueue.js
// Wave 7D: Async cloud write queue.
//
// LOCAL-FIRST INVARIANT: localStorage is ALWAYS written first.
// enqueue() is called AFTER a successful localStorage write — never before.
// Cloud failures are silent: they never break local workflow, never surface
// noisy UI, and never block render or navigation.
//
// Architecture:
//   enqueue(op)             — add upsert op after localStorage write
//   enqueueSoftDelete(id)   — cloud tombstone for locally-deleted patient
//   flush()                 — drain queue → Supabase (guarded: auth + online)
//   init()                  — load persisted queue, register online listener
//
// Queue persistence: localStorage 'denaiSyncQueue_v1' — survives page refresh.
//
// Retry contract: each op retried up to MAX_ATTEMPTS times.
// After MAX_ATTEMPTS failures, op is silently abandoned (logged to console only).
//
// Flush triggers (all non-blocking):
//   1. Scheduled 500ms after enqueue() — batches rapid saves
//   2. window 'online' event — retry on network reconnect
//   3. denaiAuth._restoreSession / _listenAuthChanges — flush on sign-in

window.denaiSyncQueue = (function () {

  var QUEUE_KEY          = 'denaiSyncQueue_v1';
  var MAX_ATTEMPTS       = 5;
  var FLUSH_DELAY        = 500; // ms — batches rapid successive saveState() calls
  var STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min — op pending with failures for this long = stalled

  var _queue          = [];
  var _flushing       = false;
  var _flushTimer     = null;
  var _status         = 'local'; // 'local' | 'syncing' | 'synced' | 'partial' | 'error'
  var _lastSyncedAt   = null;    // ISO string — set after each fully successful flush
  var _abandonedCount = 0;       // ops that exceeded MAX_ATTEMPTS — never reached cloud

  // ── Queue persistence ─────────────────────────────────────────────────────

  function _loadQueue() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) _queue = parsed;
      }
    } catch (e) { _queue = []; }
  }

  function _saveQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(_queue)); } catch (e) {}
  }

  // ── Sync status display ───────────────────────────────────────────────────
  // Updates #authUserPlan only when signed in.
  // authModule owns this element in local mode; syncQueue owns it after sign-in.

  // Returns true if any queued op has failed at least once and has been waiting > STALE_THRESHOLD_MS.
  function _hasStaleOps() {
    var now = Date.now();
    return _queue.some(function(op) {
      return op.attempts > 0 && (now - op.local_ts) > STALE_THRESHOLD_MS;
    });
  }

  function _setStatus(status) {
    _status = status;
    try {
      if (typeof denaiAuth === 'undefined' || !denaiAuth.isSignedIn()) return;
      var el = document.getElementById('authUserPlan');
      if (!el) return;
      if (status === 'syncing') {
        el.textContent = '↑ Syncing…';
      } else if (status === 'synced') {
        el.textContent = '☁ Synced';
      } else if (status === 'partial') {
        // Queue drained but some ops were silently abandoned after MAX_ATTEMPTS.
        el.textContent = '↯ Partial sync';
      } else if (status === 'error') {
        // Distinguish fresh failure from a stalled queue (failing for 30+ min).
        el.textContent = _hasStaleOps() ? '⚠ Sync stalled' : '⚠ Sync error';
      }
    } catch (e) {}
  }

  // ── UUID ──────────────────────────────────────────────────────────────────

  function _uuid() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Public: enqueue ───────────────────────────────────────────────────────
  // Call AFTER a successful localStorage write (inside saveState debounce or
  // confirmNewPatient). op shape: { type, patientId, payload, history }.
  // Deduplicates upserts for the same patient — newest payload wins.

  function enqueue(op) {
    try {
      if (!op || !op.patientId) return;

      // Wave 7G: capture raw notes BEFORE serialization — serializer strips them.
      // rawNotes is stored in the queue item so encryption can happen at flush time,
      // when the user may have already entered their passphrase (key available).
      var rawNotes = (op.payload && typeof op.payload.notes === 'string' && op.payload.notes)
        ? op.payload.notes
        : null;

      var payload = null;
      if (typeof denaiSerializer !== 'undefined') {
        payload = denaiSerializer.serializePatient(op.payload);
      } else {
        payload = op.payload; // should not happen — serializer always loads first
      }
      if (!payload) return;

      var syncOp = {
        id:         _uuid(),
        type:       op.type || 'upsert',
        entity:     'patient',
        patient_id: op.patientId,
        payload:    payload,
        rawNotes:   rawNotes,  // plaintext — encrypted at flush time if key is available
        history:    op.history || [],
        local_ts:   Date.now(),
        attempts:   0,
        last_error: null,
      };

      // Replace any existing pending upsert for this patient.
      // The newest payload is always correct; stale ops are wasteful.
      _queue = _queue.filter(function (q) {
        return !(q.type === 'upsert' && q.patient_id === syncOp.patient_id);
      });
      _queue.push(syncOp);
      _saveQueue();
      _scheduleFlush();
    } catch (e) {
      console.warn('[denaiSync] enqueue failed:', e.message);
    }
  }

  // ── Public: enqueueSoftDelete ─────────────────────────────────────────────
  // Call BEFORE removing a patient from localStorage (so the ID is still known).
  // Cancels any pending upserts for the same patient (superseded by delete).

  function enqueueSoftDelete(patientId) {
    try {
      if (!patientId) return;

      // Pending upserts for this patient are superseded — no point syncing their data.
      _queue = _queue.filter(function (q) { return q.patient_id !== patientId; });

      _queue.push({
        id:         _uuid(),
        type:       'soft-delete',
        entity:     'patient',
        patient_id: patientId,
        payload:    null,
        history:    null,
        local_ts:   Date.now(),
        attempts:   0,
        last_error: null,
      });
      _saveQueue();
      _scheduleFlush();
    } catch (e) {
      console.warn('[denaiSync] enqueueSoftDelete failed:', e.message);
    }
  }

  // ── Flush scheduling ──────────────────────────────────────────────────────

  function _scheduleFlush() {
    if (_flushTimer) return; // already pending
    _flushTimer = setTimeout(function () {
      _flushTimer = null;
      flush();
    }, FLUSH_DELAY);
  }

  // ── Public: flush ─────────────────────────────────────────────────────────
  // Drains the queue to Supabase. Safe to call at any time — no-ops if the
  // guards fail (not signed in, offline, already flushing, empty queue).

  async function flush() {
    if (_flushing) return;
    if (_queue.length === 0) return;
    if (typeof denaiAuth === 'undefined' || !denaiAuth.isSignedIn()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    // Obtain the Supabase client from authModule (single instance, session-bearing).
    var client = denaiAuth.getClient();
    if (!client) return;

    var session = denaiAuth.getSession();
    if (!session || !session.user) return;

    _flushing = true;
    try {
      _setStatus('syncing');

      var userId      = session.user.id;
      var toProcess   = _queue.slice(); // snapshot — avoid mutation during async loop
      var anyError    = false;

      for (var i = 0; i < toProcess.length; i++) {
        var op = toProcess[i];

        if (op.attempts >= MAX_ATTEMPTS) {
          _queue = _queue.filter(function (q) { return q.id !== op.id; });
          _abandonedCount++;
          console.warn('[denaiSync] abandoned after ' + MAX_ATTEMPTS + ' attempts — patient:', op.patient_id, 'type:', op.type);
          continue;
        }

        var ok = await _executeOp(client, userId, op);
        if (ok) {
          _queue = _queue.filter(function (q) { return q.id !== op.id; });
        } else {
          var qi = _queue.findIndex(function (q) { return q.id === op.id; });
          if (qi >= 0) _queue[qi].attempts += 1;
          anyError = true;
        }
      }

      _saveQueue();

      if (_queue.length === 0) {
        _setStatus(_abandonedCount > 0 ? 'partial' : 'synced');
        _lastSyncedAt = new Date().toISOString();
      } else if (anyError) {
        _setStatus('error');
      }
    } finally {
      _flushing = false;
    }
  }

  // ── Execute a single SyncOp ───────────────────────────────────────────────

  async function _executeOp(client, userId, op) {
    try {

      if (op.type === 'upsert') {
        // Wave 7G: encrypt raw notes at flush time — key is available after passphrase entry.
        // notes_enc is a separate top-level column; plaintext notes never reach the cloud.
        var notesEnc = null;
        if (typeof denaiNotesEnc !== 'undefined' && denaiNotesEnc.hasKey() && op.rawNotes) {
          try { notesEnc = await denaiNotesEnc.encrypt(op.rawNotes); } catch (e) {}
        }
        var row = {
          id:         op.patient_id,
          user_id:    userId,
          case_num:   (op.payload && op.payload.caseNum) || '',
          name:       (op.payload && op.payload.name)    || '',
          state:      op.payload,
          history:    op.history || [],
          updated_at: new Date(op.local_ts).toISOString(),
        };
        // Add notes_enc only when encrypted — never send null to overwrite existing ciphertext
        // with a null (user may not have entered passphrase this session).
        if (notesEnc) row.notes_enc = notesEnc;
        var res = await client
          .from('patients')
          .upsert(row, { onConflict: 'id' });
        if (res.error) {
          console.warn('[denaiSync] upsert error:', res.error.message, '| patient:', op.patient_id);
          var qi = _queue.findIndex(function (q) { return q.id === op.id; });
          if (qi >= 0) _queue[qi].last_error = res.error.message;
          return false;
        }
        return true;

      } else if (op.type === 'soft-delete') {
        var delRes = await client
          .from('patients')
          .update({ deleted_at: new Date(op.local_ts).toISOString() })
          .eq('id', op.patient_id)
          .eq('user_id', userId);
        if (delRes.error) {
          console.warn('[denaiSync] soft-delete error:', delRes.error.message, '| patient:', op.patient_id);
          var qi2 = _queue.findIndex(function (q) { return q.id === op.id; });
          if (qi2 >= 0) _queue[qi2].last_error = delRes.error.message;
          return false;
        }
        return true;
      }

      // Unknown op type — drop it to unblock the queue.
      console.warn('[denaiSync] unknown op type:', op.type, '— dropping');
      return true;

    } catch (e) {
      console.warn('[denaiSync] op exception:', e.message, '| type:', op.type, '| patient:', op.patient_id);
      return false;
    }
  }

  // ── Public: init ──────────────────────────────────────────────────────────
  // Synchronous. Call after denaiAuth.init() in the app's init() function.

  function init() {
    _loadQueue();
    window.addEventListener('online', function () { flush(); });
  }

  function getStatus()          { return _status; }
  function getQueueLength()     { return _queue.length; }
  function getLastSyncedAt()    { return _lastSyncedAt; }
  function getAbandonedCount()  { return _abandonedCount; }
  // hasPendingFor — used by cloudSync merge engine to detect in-flight local edits.
  // Returns true if an unsent upsert exists for patientId — cloud must not overwrite it.
  function hasPendingFor(patientId) {
    return _queue.some(function (op) {
      return op.patient_id === patientId && op.type === 'upsert';
    });
  }

  return Object.freeze({
    init:               init,
    enqueue:            enqueue,
    enqueueSoftDelete:  enqueueSoftDelete,
    flush:              flush,
    hasPendingFor:      hasPendingFor,
    getStatus:          getStatus,
    getQueueLength:     getQueueLength,
    getLastSyncedAt:    getLastSyncedAt,
    getAbandonedCount:  getAbandonedCount,
  });

})();
