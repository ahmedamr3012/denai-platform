// tests/sync/runner.js
// Beta Hardening CI — Cloud Sync Pipeline Regression Runner
//
// Injected into the live page by tests/ci/sync.spec.js.
//
// Coverage (11 scenarios):
//   Group 1 — Serializer allowlist      (5 scenarios, pure function)
//   Group 2 — SyncQueue lifecycle       (4 scenarios, isolated queue state)
//   Group 3 — Tombstone protection      (1 scenario,  mocked hydrate)
//   Group 4 — Placeholder protection    (1 scenario,  mocked hydrate)
//
// Invariants:
//   - All localStorage keys are saved before and restored after tests.
//   - window.denaiAuth and window.denaiSyncQueue are temporarily replaced
//     only for hydrate() scenarios and fully restored in finally blocks.
//   - No runtime orchestration code is modified.
(function () {
  'use strict';

  var QUEUE_KEY    = 'denaiSyncQueue_v1';
  var PATIENTS_KEY = 'dandyPatients_v2';
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

  // Write an empty queue to localStorage and reload the internal _queue via
  // init(). Calling init() with '[]' in localStorage resets _queue to [].
  // Returns nothing — call lsGet(QUEUE_KEY) before this if you need to save.
  function clearQueueState() {
    localStorage.setItem(QUEUE_KEY, '[]');
    window.denaiSyncQueue.init();
  }

  // Restore queue to a previously saved localStorage value and reload _queue.
  // Must be called after window.denaiSyncQueue has been restored to the real object.
  function restoreQueueState(saved) {
    var toLoad = saved !== null ? saved : '[]';
    localStorage.setItem(QUEUE_KEY, toLoad);
    window.denaiSyncQueue.init();
    if (saved === null) localStorage.removeItem(QUEUE_KEY);
  }

  // ── Mock builders ─────────────────────────────────────────────────────────

  // Chainable Supabase client mock.
  // Terminal methods: .order() → mainRows,  .not() → tombstoneRows
  // (matches the two real query patterns in cloudSync._fetchAndMerge and
  //  cloudSync._fetchTombstones).
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
      getSession: function () { return { user: { id: 'test-ci-user' } }; },
      init:       function () {},
    };
  }

  // Tombstone test stub: hasPendingFor always returns false and enqueue is a
  // no-op, so Pass 2 of _mergeCloudIntoLocal cannot set hasPendingFor=true
  // and block Pass 3's tombstone removal. This isolates the tombstone logic.
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
    // Group 1 — Serializer: allowlist, PHI strip, null guard (pure function)
    // ═════════════════════════════════════════════════════════════════════════

    await run('serializer:strips-notes-and-activeSite', function (assert) {
      var out = window.denaiSerializer.serializePatient({
        id: 'p1', name: 'Alice', age: 35, tooth: 21,
        notes:      'PHI: sensitive clinical notes',
        activeSite: 3,
      });
      assert(out !== null,             'serializePatient must not return null');
      assert(!('notes'      in out),   'notes must be stripped (PHI — deferred to Wave 7G encryption)');
      assert(!('activeSite' in out),   'activeSite must be stripped (device-local nav state)');
    });

    await run('serializer:strips-transient-fields', function (assert) {
      var out = window.denaiSerializer.serializePatient({
        id: 'p1',
        _syncedAt:     '2025-01-01T00:00:00Z',
        reportHistory: [{ date: '2025-01-01' }],
        lastAccessed:  1234567890,
        unknownExtra:  'should-not-appear',
      });
      assert(out !== null,                  'output must not be null');
      assert(!('_syncedAt'     in out),     '_syncedAt must be stripped (merge metadata, never uploaded)');
      assert(!('reportHistory' in out),     'reportHistory must be stripped (device-local, large array)');
      assert(!('lastAccessed'  in out),     'lastAccessed must be stripped');
      assert(!('unknownExtra'  in out),     'unknown fields must not pass through allowlist');
    });

    await run('serializer:preserves-clinical-fields', function (assert) {
      var patient = {
        id: 'p1', caseNum: 'C-001', name: 'Bob', age: 45, gender: 'Male',
        tooth: 36, condition: 'decay', bone: 'adequate', hygiene: 'fair',
        occlusion: 'class1', tx: 'implant',
        smoking: false, diabetes: false,
        remainingStructure: 'adequate', endodonticStatus: 'vital', parafunction: 'none',
        multiTooth: false, tooth2: null, abutmentQuality: 'good',
        multiSite: false, site2Tooth: null, site2Condition: null,
        site2Structure: null, site2EndoStatus: null,
        costImplant: 5000, costBridge: 3500, costBoneGraft: 1200,
        costCrown: 1500, costRCT: 800, costPostCore: 600,
        planApproved: true, labStatus: 'sent',
      };
      var out = window.denaiSerializer.serializePatient(patient);
      assert(out !== null,                  'output must not be null');
      assert(out.id          === 'p1',      'id preserved');
      assert(out.caseNum     === 'C-001',   'caseNum preserved');
      assert(out.name        === 'Bob',     'name preserved');
      assert(out.age         === 45,        'age preserved');
      assert(out.tooth       === 36,        'tooth preserved');
      assert(out.condition   === 'decay',   'condition preserved');
      assert(out.tx          === 'implant', 'tx preserved');
      assert(out.costImplant === 5000,      'costImplant preserved');
      assert(out.planApproved === true,     'planApproved preserved (Wave 8C workflow field)');
      assert(out.labStatus    === 'sent',   'labStatus preserved (Wave 8C workflow field)');
    });

    await run('serializer:null-and-invalid-inputs-return-null', function (assert) {
      assert(window.denaiSerializer.serializePatient(null)      === null, 'null → null');
      assert(window.denaiSerializer.serializePatient(undefined) === null, 'undefined → null');
      assert(window.denaiSerializer.serializePatient('string')  === null, 'string input → null');
      assert(window.denaiSerializer.serializePatient(42)        === null, 'number input → null');
    });

    await run('serializer:schema-ver-always-injected', function (assert) {
      var out = window.denaiSerializer.serializePatient({ id: 'p1' });
      assert(out !== null,         'output must not be null');
      assert(out.schema_ver === 1, 'schema_ver must equal 1 (matches schema.sql DEFAULT)');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 2 — SyncQueue lifecycle (scenarios share queue state sequentially)
    // ═════════════════════════════════════════════════════════════════════════

    var savedQueue = lsGet(QUEUE_KEY);
    clearQueueState(); // reset internal _queue to [] for isolation

    await run('syncqueue:enqueue-adds-op', function (assert) {
      var before = window.denaiSyncQueue.getQueueLength();
      window.denaiSyncQueue.enqueue({
        type: 'upsert', patientId: 'test-ci-p-001',
        payload: { id: 'test-ci-p-001', name: 'CI Test Patient' },
      });
      var after = window.denaiSyncQueue.getQueueLength();
      assert(after === before + 1,
        'queue length must increase by 1 after enqueue (before=' + before + ' after=' + after + ')');
    });

    await run('syncqueue:hasPendingFor-reflects-enqueue', function (assert) {
      assert(window.denaiSyncQueue.hasPendingFor('test-ci-p-001') === true,
        'hasPendingFor must return true after enqueue');
      assert(window.denaiSyncQueue.hasPendingFor('test-ci-p-999') === false,
        'hasPendingFor must return false for patient never enqueued');
    });

    await run('syncqueue:deduplication-same-patient-no-growth', function (assert) {
      var before = window.denaiSyncQueue.getQueueLength();
      window.denaiSyncQueue.enqueue({
        type: 'upsert', patientId: 'test-ci-p-001', // same patient — must replace
        payload: { id: 'test-ci-p-001', name: 'CI Test Patient (updated)' },
      });
      var after = window.denaiSyncQueue.getQueueLength();
      assert(after === before,
        'dedup: re-enqueueing same patient must not grow queue (before=' + before + ' after=' + after + ')');
    });

    await run('syncqueue:soft-delete-cancels-pending-upsert', function (assert) {
      assert(window.denaiSyncQueue.hasPendingFor('test-ci-p-001') === true,
        'precondition: upsert must still be pending');
      window.denaiSyncQueue.enqueueSoftDelete('test-ci-p-001');
      assert(window.denaiSyncQueue.hasPendingFor('test-ci-p-001') === false,
        'hasPendingFor must be false after soft-delete cancels the pending upsert');
    });

    restoreQueueState(savedQueue); // restore original queue before hydrate tests

    // ═════════════════════════════════════════════════════════════════════════
    // Group 3 — Tombstone protection: cloud-deleted patient removed after hydrate
    //
    // Design note: _mergeCloudIntoLocal runs Pass 2 (enqueue local-only patients)
    // BEFORE Pass 3 (tombstone removal). Pass 2 would set hasPendingFor=true for
    // the tombstone patient, which Pass 3's guard would then use to abort removal.
    // makeNoPendingQueueStub() prevents this interaction so Pass 3 is exercised
    // in isolation — this is the correct way to test the tombstone logic.
    // ═════════════════════════════════════════════════════════════════════════

    await run('tombstone:cloud-deleted-patient-removed-after-hydrate', async function (assert) {
      var pid = 'test-ci-tomb-p-001';
      var qid = 'test-ci-tomb-q-001'; // active cloud patient — prevents _handleFirstLogin path

      var savedPatients  = lsGet(PATIENTS_KEY);
      var savedHistP     = lsGet(HIST_PREFIX + pid);
      var savedAuth      = window.denaiAuth;
      var savedSyncQ     = window.denaiSyncQueue;
      var savedTombQueue = lsGet(QUEUE_KEY);
      // Clear queue before mocking auth so any pending flush timers from Group 2
      // hit an empty queue and no-op, even if they fire during this async test.
      clearQueueState();

      try {
        // P exists locally with a prior sync timestamp; Q is active in cloud
        localStorage.setItem(PATIENTS_KEY, JSON.stringify([
          { id: pid, name: 'Tombstone Patient', _syncedAt: '2024-01-01T00:00:00.000Z' },
          { id: qid, name: 'Unrelated Patient', _syncedAt: '2024-01-01T00:00:00.000Z' },
        ]));

        // Cloud: Q is active, P is absent (tombstoned — deleted_at IS NOT NULL on cloud)
        var cloudRows      = [{
          id: qid, case_num: '', name: 'Unrelated Patient',
          state: { id: qid, name: 'Unrelated Patient', schema_ver: 1 },
          history: [], notes_enc: null,
          updated_at: '2024-01-01T00:00:00.000Z',
        }];
        // Tombstone: P was deleted on cloud AFTER P's last local sync
        var tombstoneRows  = [{ id: pid, deleted_at: '2025-06-01T00:00:00.000Z' }];

        window.denaiSyncQueue = makeNoPendingQueueStub();
        window.denaiAuth      = makeAuthStub(makeMockClient(cloudRows, tombstoneRows));

        await window.denaiCloudSync.hydrate();

        var list  = JSON.parse(localStorage.getItem(PATIENTS_KEY) || '[]');
        assert(!list.some(function (p) { return p.id === pid; }),
          'tombstoned patient must be absent from localStorage after hydrate');
        assert(list.some(function (p) { return p.id === qid; }),
          'unrelated active patient must remain in localStorage after hydrate');

      } finally {
        window.denaiSyncQueue = savedSyncQ;   // restore real queue first
        window.denaiAuth      = savedAuth;
        restoreQueueState(savedTombQueue);
        lsSet(PATIENTS_KEY, savedPatients);
        lsSet(HIST_PREFIX + pid, savedHistP);
        lsClear(HIST_PREFIX + qid);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 4 — Placeholder protection: seed patient never enqueued on first login
    // ═════════════════════════════════════════════════════════════════════════

    await run('placeholder:seed-patient-not-enqueued-on-first-login', async function (assert) {
      var seedId = 'test-ci-seed-001';
      var realId = 'test-ci-real-001';

      var savedPatients = lsGet(PATIENTS_KEY);
      var savedAuth     = window.denaiAuth;
      var savedQueue2   = lsGet(QUEUE_KEY);

      try {
        // Seed: name is the bootstrap default, no _syncedAt, no history → _isPlaceholder = true
        // Real: any other name → _isPlaceholder = false → must be enqueued
        localStorage.setItem(PATIENTS_KEY, JSON.stringify([
          { id: seedId, name: 'Mohamed A.' },
          { id: realId, name: 'Ahmed B.', age: 40 },
        ]));

        clearQueueState(); // clean baseline so hasPendingFor reads are unambiguous
        // Cloud returns empty → _handleFirstLogin path fires
        window.denaiAuth = makeAuthStub(makeMockClient([], []));
        await window.denaiCloudSync.hydrate();

        assert(window.denaiSyncQueue.hasPendingFor(seedId) === false,
          'bootstrap placeholder (Mohamed A., no history, no _syncedAt) must NOT be enqueued');
        assert(window.denaiSyncQueue.hasPendingFor(realId) === true,
          'real non-placeholder patient must be enqueued for cloud sync on first login');

      } finally {
        window.denaiAuth = savedAuth;
        restoreQueueState(savedQueue2);
        lsSet(PATIENTS_KEY, savedPatients);
        lsClear(HIST_PREFIX + seedId);
        lsClear(HIST_PREFIX + realId);
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

  window.DenaiSyncRunner = Object.freeze({ runAll: runAll });

})();
