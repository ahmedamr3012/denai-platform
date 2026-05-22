// tests/e2e/runner.js
// Multi-Device E2E Simulation Runner
//
// Injected into the live page by tests/e2e/multidevice.spec.js.
// Simulates multi-device scenarios via mock cloud layer + localStorage state.
//
// Coverage (7 scenarios):
//   Group 1 — Cross-device hydration  (1 scenario)
//   Group 2 — Tombstone propagation   (1 scenario)
//   Group 3 — Offline → reconnect     (2 scenarios)
//   Group 4 — Conflict resolution     (2 scenarios)
//   Group 5 — Encryption continuity   (1 scenario)
//
// Simulation model:
//   "Device A" state = pre-configured localStorage / mock cloud responses
//   "Device B" state = post-hydrate localStorage content verified by assertions
//
// Invariants:
//   - All window.denaiAuth and window.denaiSyncQueue patches are fully restored
//     in finally blocks. localStorage keys are saved and restored the same way.
//   - No runtime orchestration code is modified.
(function () {
  'use strict';

  var QUEUE_KEY    = 'denaiSyncQueue_v1';
  var PATIENTS_KEY = 'denaiPatients_v2';
  var HIST_PREFIX  = 'dandyCaseHistory_v1_';

  // ── Assertion micro-framework ─────────────────────────────────────────────

  function makeCtx(id) {
    var failures = [], count = 0;
    return {
      assert: function (cond, msg) { count++; if (!cond) failures.push(msg); },
      result: function () {
        return { id: id, pass: failures.length === 0, failures: failures.slice(), assertionCount: count };
      }
    };
  }

  // ── localStorage helpers ──────────────────────────────────────────────────

  function lsGet(key)      { return localStorage.getItem(key); }
  function lsSet(key, val) { if (val !== null) localStorage.setItem(key, val); else localStorage.removeItem(key); }
  function lsClear(key)    { localStorage.removeItem(key); }

  function clearQueueState() {
    localStorage.setItem(QUEUE_KEY, '[]');
    window.denaiSyncQueue.init();
  }
  function restoreQueueState(saved) {
    var toLoad = saved !== null ? saved : '[]';
    localStorage.setItem(QUEUE_KEY, toLoad);
    window.denaiSyncQueue.init();
    if (saved === null) localStorage.removeItem(QUEUE_KEY);
  }

  // ── Mock builders (same pattern as tests/sync/runner.js) ─────────────────

  // Chainable mock: .order() → mainRows (main patient fetch)
  //                .not()   → tombstoneRows (deleted_at IS NOT NULL fetch)
  function makeMockClient(mainRows, tombstoneRows) {
    return {
      from: function () {
        return {
          select: function () { return this; },
          is:     function () { return this; },
          in:     function () { return this; },
          order:  function () { return Promise.resolve({ data: mainRows      || [], error: null }); },
          not:    function () { return Promise.resolve({ data: tombstoneRows || [], error: null }); },
          update: function () { return this; },
          eq:     function () { return Promise.resolve({ data: [], error: null }); },
          upsert: function () { return Promise.resolve({ data: [], error: null }); },
        };
      }
    };
  }

  function makeAuthStub(mockClient) {
    return {
      isSignedIn: function () { return true; },
      getClient:  function () { return mockClient; },
      getSession: function () { return { user: { id: 'test-e2e-user' } }; },
      init:       function () {},
    };
  }

  // Prevents Pass 2 from setting hasPendingFor=true and blocking Pass 3
  // (same isolation technique used in tests/sync/runner.js Group 3).
  function makeNoPendingQueueStub() {
    return {
      enqueue:           function () {},
      enqueueSoftDelete: function () {},
      flush:             function () {},
      init:              function () {},
      hasPendingFor:     function () { return false; },
      getStatus:         function () { return 'local'; },
      getQueueLength:    function () { return 0; },
      getLastSyncedAt:   function () { return null; },
    };
  }

  // ── Runner ────────────────────────────────────────────────────────────────

  async function runAll() {
    var results = [];
    var passed = 0, failed = 0, totalAssertions = 0;

    async function run(id, fn) {
      var ctx = makeCtx(id);
      try {
        await Promise.resolve(fn(ctx.assert.bind(ctx)));
      } catch (e) {
        ctx.assert(false, 'threw: ' + (e && e.message ? e.message : String(e)));
      }
      var r = ctx.result();
      results.push(r);
      totalAssertions += r.assertionCount;
      if (r.pass) passed++; else failed++;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Group 1 — Cross-device hydration
    //
    // Device A created patient P and synced it to cloud.
    // Device B (localStorage has no P) hydrates.
    // After hydrate: Device B has P in localStorage with correct _syncedAt.
    //
    // cloudSync.js Pass 1: cloud patients absent from local are push()ed to
    // mergedList (line "New patient from cloud — add to local list").
    // ═════════════════════════════════════════════════════════════════════════

    await run('e2e:device-b-receives-patient-created-on-device-a', async function (assert) {
      var pid = 'test-e2e-hyd-001';
      var qid = 'test-e2e-hyd-anchor'; // second cloud patient keeps cloudRows non-empty

      var savedPatients = lsGet(PATIENTS_KEY);
      var savedAuth     = window.denaiAuth;
      var savedSyncQ    = window.denaiSyncQueue;
      var savedQueue    = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        // Device B: has only qid locally; pid is absent (as if this is a new device)
        localStorage.setItem(PATIENTS_KEY, JSON.stringify([
          { id: qid, name: 'Existing Local Patient', _syncedAt: '2024-01-01T00:00:00.000Z' },
        ]));

        var cloudUpdatedAt = '2025-03-01T12:00:00.000Z';
        var cloudRows = [
          {
            id: pid, case_num: 'C-E2E-001', name: 'Device A Patient',
            state: { id: pid, name: 'Device A Patient', tooth: 16, tx: 'implant', schema_ver: 1 },
            history: [], notes_enc: null,
            updated_at: cloudUpdatedAt,
          },
          {
            id: qid, case_num: '', name: 'Existing Local Patient',
            state: { id: qid, name: 'Existing Local Patient', schema_ver: 1 },
            history: [], notes_enc: null,
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ];

        window.denaiSyncQueue = makeNoPendingQueueStub();
        window.denaiAuth      = makeAuthStub(makeMockClient(cloudRows, []));

        await window.denaiCloudSync.hydrate();

        var list  = JSON.parse(localStorage.getItem(PATIENTS_KEY) || '[]');
        var found = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === pid) { found = list[i]; break; }
        }

        assert(found !== null,
          'Device A patient must appear in Device B localStorage after hydrate');
        assert(found.name === 'Device A Patient',
          'hydrated patient must carry Device A name from cloud state');
        assert(found._syncedAt === cloudUpdatedAt,
          'hydrated patient must have _syncedAt set to cloud updated_at');

      } finally {
        window.denaiSyncQueue = savedSyncQ;
        window.denaiAuth      = savedAuth;
        restoreQueueState(savedQueue);
        lsSet(PATIENTS_KEY, savedPatients);
        lsClear(HIST_PREFIX + pid);
        lsClear(HIST_PREFIX + qid);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 2 — Tombstone propagation
    //
    // Device A deleted patient P (tombstone in cloud).
    // Device B locally still has P (with a prior _syncedAt).
    // After Device B hydrates: P is removed from Device B localStorage.
    //
    // Pass 2 / Pass 3 interaction: same as tests/sync/runner.js Group 3.
    // makeNoPendingQueueStub() lets Pass 3 fire by preventing Pass 2 from
    // setting hasPendingFor=true on the tombstoned patient.
    // ═════════════════════════════════════════════════════════════════════════

    await run('e2e:tombstone-device-a-deletion-propagates-to-device-b', async function (assert) {
      var pid = 'test-e2e-tomb-p-001';
      var qid = 'test-e2e-tomb-q-001'; // active cloud patient prevents first-login path

      var savedPatients = lsGet(PATIENTS_KEY);
      var savedAuth     = window.denaiAuth;
      var savedSyncQ    = window.denaiSyncQueue;
      var savedQueue    = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        localStorage.setItem(PATIENTS_KEY, JSON.stringify([
          { id: pid, name: 'Deleted by Device A', _syncedAt: '2024-01-01T00:00:00.000Z' },
          { id: qid, name: 'Active Cloud Patient', _syncedAt: '2024-01-01T00:00:00.000Z' },
        ]));

        var cloudRows = [{
          id: qid, case_num: '', name: 'Active Cloud Patient',
          state: { id: qid, name: 'Active Cloud Patient', schema_ver: 1 },
          history: [], notes_enc: null,
          updated_at: '2024-01-01T00:00:00.000Z',
        }];
        var tombstoneRows = [{ id: pid, deleted_at: '2025-06-01T00:00:00.000Z' }];

        window.denaiSyncQueue = makeNoPendingQueueStub();
        window.denaiAuth      = makeAuthStub(makeMockClient(cloudRows, tombstoneRows));

        await window.denaiCloudSync.hydrate();

        var list = JSON.parse(localStorage.getItem(PATIENTS_KEY) || '[]');
        assert(!list.some(function (p) { return p.id === pid; }),
          'Device A tombstone must remove patient from Device B localStorage after hydrate');
        assert(list.some(function (p) { return p.id === qid; }),
          'non-tombstoned patient must remain on Device B after hydrate');

      } finally {
        window.denaiSyncQueue = savedSyncQ;
        window.denaiAuth      = savedAuth;
        restoreQueueState(savedQueue);
        lsSet(PATIENTS_KEY, savedPatients);
        lsClear(HIST_PREFIX + pid);
        lsClear(HIST_PREFIX + qid);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 3 — Offline → reconnect
    //
    // Scenario A: Device A edits two patients while offline.
    //   Queue ops are written to localStorage immediately (local-first invariant).
    //   Verified directly from localStorage — simulates durability across a
    //   page reload that happens while the device remains offline.
    //
    // Scenario B: Device A comes back online.
    //   flush() with a working mock client drains the queue.
    //   Queue is empty after a successful flush.
    // ═════════════════════════════════════════════════════════════════════════

    await run('e2e:offline-queue-survives-in-localstorage', function (assert) {
      var pid1 = 'test-e2e-offline-p-001';
      var pid2 = 'test-e2e-offline-p-002';
      var savedQueue = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        // Simulate two offline edits without flushing
        window.denaiSyncQueue.enqueue({
          type: 'upsert', patientId: pid1,
          payload: { id: pid1, name: 'Offline Patient 1' },
        });
        window.denaiSyncQueue.enqueue({
          type: 'upsert', patientId: pid2,
          payload: { id: pid2, name: 'Offline Patient 2' },
        });

        // Read queue backing store directly — simulates what a page reload would see
        var raw   = localStorage.getItem(QUEUE_KEY);
        var queue = raw ? JSON.parse(raw) : [];

        assert(queue.length === 2,
          'two offline edits must persist as two queue entries in localStorage (got ' + queue.length + ')');
        assert(queue.some(function (op) { return op.patient_id === pid1; }),
          'first offline edit (pid1) must be present in localStorage queue');
        assert(queue.some(function (op) { return op.patient_id === pid2; }),
          'second offline edit (pid2) must be present in localStorage queue');

      } finally {
        restoreQueueState(savedQueue);
      }
    });

    await run('e2e:reconnect-flush-empties-queue', async function (assert) {
      var pid = 'test-e2e-reconnect-p-001';
      var savedAuth  = window.denaiAuth;
      var savedQueue = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        window.denaiSyncQueue.enqueue({
          type: 'upsert', patientId: pid,
          payload: { id: pid, name: 'Reconnect Test Patient' },
        });

        assert(window.denaiSyncQueue.getQueueLength() === 1,
          'precondition: one op must be queued before flush');

        // Simulate reconnect: mock auth becomes available with a working client
        window.denaiAuth = makeAuthStub(makeMockClient([], []));

        await window.denaiSyncQueue.flush();

        assert(window.denaiSyncQueue.getQueueLength() === 0,
          'queue must be empty after successful flush (simulated reconnect to cloud)');

      } finally {
        window.denaiAuth = savedAuth;
        restoreQueueState(savedQueue);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 4 — Conflict resolution
    //
    // Documented behavior (cloudSync.js _mergeOne):
    //   cloud wins  when cloudRow.updated_at > local._syncedAt AND no pending edit
    //   local wins  when hasPendingFor(id) is true — in-flight edit takes priority
    //
    // Scenario A: no pending edit → cloud state (newer) overwrites local.
    // Scenario B: pending edit in queue → local state preserved even when cloud newer.
    // ═════════════════════════════════════════════════════════════════════════

    await run('e2e:conflict-cloud-wins-when-no-pending-edit', async function (assert) {
      var pid = 'test-e2e-conflict-p-001';
      var qid = 'test-e2e-conflict-q-001';

      var savedPatients = lsGet(PATIENTS_KEY);
      var savedAuth     = window.denaiAuth;
      var savedSyncQ    = window.denaiSyncQueue;
      var savedQueue    = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        // Device B: patient P has local tx='bridge', last synced at T_old
        var localTx = 'bridge';
        localStorage.setItem(PATIENTS_KEY, JSON.stringify([
          { id: pid, name: 'Conflict Patient', tx: localTx, _syncedAt: '2024-01-01T00:00:00.000Z' },
          { id: qid, name: 'Anchor Patient',                _syncedAt: '2024-01-01T00:00:00.000Z' },
        ]));

        // Cloud: Device A changed tx='implant', updated_at > local _syncedAt
        var cloudTx        = 'implant';
        var cloudUpdatedAt = '2025-05-01T00:00:00.000Z';
        var cloudRows = [
          {
            id: pid, case_num: '', name: 'Conflict Patient',
            state: { id: pid, name: 'Conflict Patient', tx: cloudTx, schema_ver: 1 },
            history: [], notes_enc: null,
            updated_at: cloudUpdatedAt,
          },
          {
            id: qid, case_num: '', name: 'Anchor Patient',
            state: { id: qid, name: 'Anchor Patient', schema_ver: 1 },
            history: [], notes_enc: null,
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ];

        window.denaiSyncQueue = makeNoPendingQueueStub(); // no pending edit for P
        window.denaiAuth      = makeAuthStub(makeMockClient(cloudRows, []));

        await window.denaiCloudSync.hydrate();

        var list   = JSON.parse(localStorage.getItem(PATIENTS_KEY) || '[]');
        var merged = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === pid) { merged = list[i]; break; }
        }

        assert(merged !== null,
          'patient must still exist in localStorage after merge');
        assert(merged.tx === cloudTx,
          'cloud wins: tx must be "' + cloudTx + '" (cloud newer, no pending edit) — was "' + (merged && merged.tx) + '"');
        assert(merged._syncedAt === cloudUpdatedAt,
          'cloud wins: _syncedAt must be updated to cloud updated_at after merge');

      } finally {
        window.denaiSyncQueue = savedSyncQ;
        window.denaiAuth      = savedAuth;
        restoreQueueState(savedQueue);
        lsSet(PATIENTS_KEY, savedPatients);
        lsClear(HIST_PREFIX + pid);
        lsClear(HIST_PREFIX + qid);
      }
    });

    await run('e2e:conflict-local-wins-when-pending-edit-in-queue', async function (assert) {
      var pid = 'test-e2e-conflict-p-002';
      var qid = 'test-e2e-conflict-q-002';

      var savedPatients = lsGet(PATIENTS_KEY);
      var savedAuth     = window.denaiAuth;
      var savedQueue    = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        // Device B: patient P has local tx='bridge', unsent upsert in queue
        var localTx = 'bridge';
        localStorage.setItem(PATIENTS_KEY, JSON.stringify([
          { id: pid, name: 'Pending Edit Patient', tx: localTx, _syncedAt: '2024-01-01T00:00:00.000Z' },
          { id: qid, name: 'Anchor Patient',                    _syncedAt: '2024-01-01T00:00:00.000Z' },
        ]));

        window.denaiSyncQueue.enqueue({
          type: 'upsert', patientId: pid,
          payload: { id: pid, name: 'Pending Edit Patient', tx: localTx },
        });

        assert(window.denaiSyncQueue.hasPendingFor(pid) === true,
          'precondition: pending edit must be in queue before hydrate');

        // Cloud: Device A changed tx='implant' (newer than local _syncedAt)
        var cloudTx  = 'implant';
        var cloudRows = [
          {
            id: pid, case_num: '', name: 'Pending Edit Patient',
            state: { id: pid, name: 'Pending Edit Patient', tx: cloudTx, schema_ver: 1 },
            history: [], notes_enc: null,
            updated_at: '2025-05-01T00:00:00.000Z',
          },
          {
            id: qid, case_num: '', name: 'Anchor Patient',
            state: { id: qid, name: 'Anchor Patient', schema_ver: 1 },
            history: [], notes_enc: null,
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ];

        // Real queue is used — hasPendingFor(pid) returns true during _mergeOne
        window.denaiAuth = makeAuthStub(makeMockClient(cloudRows, []));

        await window.denaiCloudSync.hydrate();

        var list  = JSON.parse(localStorage.getItem(PATIENTS_KEY) || '[]');
        var local = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === pid) { local = list[i]; break; }
        }

        assert(local !== null,
          'patient must still exist in localStorage after merge');
        assert(local.tx === localTx,
          'local wins: tx must remain "' + localTx + '" — hasPendingFor guard blocked cloud overwrite');

      } finally {
        window.denaiAuth = savedAuth;
        restoreQueueState(savedQueue);
        lsSet(PATIENTS_KEY, savedPatients);
        lsClear(HIST_PREFIX + pid);
        lsClear(HIST_PREFIX + qid);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 5 — Encryption continuity
    //
    // Wave 7G multi-device key agreement:
    //   identical passphrase + identical salt → identical PBKDF2-derived AES-GCM key
    //
    // Device A encrypts clinical notes with passphrase P and salt S.
    // Device B derives the same key using the same P and S.
    // Device B can decrypt Device A's ciphertext to the original plaintext.
    //
    // The salt (non-sensitive) is stored in profiles.preferences.notesKeySalt
    // and shared to all devices. Only the passphrase stays out of cloud.
    // ═════════════════════════════════════════════════════════════════════════

    await run('e2e:encryption-continuity-device-b-decrypts-device-a-ciphertext', async function (assert) {
      var sharedPassphrase = 'beta-e2e-shared-passphrase';
      var clinicalNotes    = 'D1 implant site: bone graft performed 2025-04-10, osseointegration 4mo';

      try {
        // Device A: derive key, encrypt clinical notes
        var salt  = window.denaiNotesEnc.generateSalt();
        var initA = await window.denaiNotesEnc.init(sharedPassphrase, salt);
        assert(initA === true,
          'Device A: PBKDF2 key derivation must succeed');

        var ciphertext = await window.denaiNotesEnc.encrypt(clinicalNotes);
        assert(ciphertext !== null,
          'Device A: encrypt must return a non-null ciphertext');

        // Clear key — simulates session boundary (different device / new session)
        window.denaiNotesEnc.clearKey();
        assert(window.denaiNotesEnc.hasKey() === false,
          'key must be cleared between Device A and Device B sessions');

        // Device B: re-derive key with same passphrase + same salt
        // PBKDF2 is deterministic: same (passphrase, salt) → same CryptoKey
        var initB = await window.denaiNotesEnc.init(sharedPassphrase, salt);
        assert(initB === true,
          'Device B: key derivation with shared passphrase+salt must succeed');

        var decrypted = await window.denaiNotesEnc.decrypt(ciphertext);
        assert(decrypted === clinicalNotes,
          'Device B must decrypt Device A ciphertext to identical plaintext (same passphrase+salt = same key)');

      } finally {
        window.denaiNotesEnc.clearKey();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────

    return {
      passed:          passed,
      failed:          failed,
      total:           results.length,
      totalAssertions: totalAssertions,
      results:         results,
    };
  }

  window.DenaiE2ERunner = Object.freeze({ runAll: runAll });

})();
