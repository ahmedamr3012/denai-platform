// tests/auth/runner.js
// Beta Hardening CI — Auth & Encryption Regression Runner
//
// Injected into the live page by tests/ci/auth.spec.js.
//
// Coverage (12 scenarios):
//   Group 1 — Auth initial state     (2 scenarios, read-only)
//   Group 2 — Sign-out lifecycle     (2 scenarios, call signOut(), check side effects)
//   Group 3 — Encryption integrity   (6 scenarios, PBKDF2 + AES-GCM crypto)
//   Group 4 — Cloud PHI safety       (2 scenarios, queue inspection + null-key guard)
//
// Invariants:
//   - Encryption key is cleared after each Group 3 scenario.
//   - localStorage state (patients, queue) is saved and restored.
//   - No runtime orchestration code is modified.
//   - signOut() uses the real module — verifies actual clearKey() wiring.
(function () {
  'use strict';

  var QUEUE_KEY    = 'denaiSyncQueue_v1';
  var PATIENTS_KEY = 'denaiPatients_v2';

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

  // Queue isolation — same pattern as tests/sync/runner.js
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
    // Group 1 — Auth initial state
    // Playwright launches a fresh browser context: no localStorage, no tokens.
    // Auth has settled by the time the runner starts (spec waits for status
    // to leave 'reconnecting'). Expected state: local mode, no session.
    // ═════════════════════════════════════════════════════════════════════════

    await run('auth:no-session-is-local-mode', function (assert) {
      assert(window.denaiAuth.getStatus()  === 'local',
        'status must be "local" in fresh context — no stored session exists');
      assert(window.denaiAuth.isSignedIn() === false,
        'isSignedIn must be false when no session exists');
      assert(window.denaiAuth.getSession() === null,
        'getSession must return null when no session is stored');
    });

    await run('auth:getClient-does-not-crash', function (assert) {
      var threw = false, client;
      try { client = window.denaiAuth.getClient(); } catch (e) { threw = true; }
      assert(!threw,
        'getClient() must never throw');
      assert(client === null || (typeof client === 'object' && client !== null),
        'getClient() must return null or an object — never undefined or a primitive');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 2 — Sign-out lifecycle
    // signOut() uses the real denaiAuth module: Supabase SDK call is fire-and-
    // forget (errors caught and ignored). State cleanup runs unconditionally.
    // ═════════════════════════════════════════════════════════════════════════

    await run('auth:signout-sets-local-status', async function (assert) {
      await window.denaiAuth.signOut();
      assert(window.denaiAuth.getStatus()  === 'local',
        'status must be "local" after signOut()');
      assert(window.denaiAuth.isSignedIn() === false,
        'isSignedIn must be false after signOut()');
      assert(window.denaiAuth.getSession() === null,
        'getSession must return null after signOut()');
    });

    await run('auth:signout-clears-encryption-key', async function (assert) {
      // Derive a real AES-GCM key so hasKey() is true, then verify signOut()
      // calls denaiNotesEnc.clearKey() as required by the Wave 7G invariant.
      var salt = window.denaiNotesEnc.generateSalt();
      var ok   = await window.denaiNotesEnc.init('ci-signout-test-passphrase', salt);
      assert(ok === true,
        'key derivation must succeed before signOut test');
      assert(window.denaiNotesEnc.hasKey() === true,
        'hasKey must be true after init — precondition for this test');

      await window.denaiAuth.signOut();

      assert(window.denaiNotesEnc.hasKey() === false,
        'signOut() must clear in-memory encryption key (Wave 7G: key is per-session only)');
    });

    await run('auth:signout-preserves-patient-data', async function (assert) {
      var savedPatients = lsGet(PATIENTS_KEY);
      try {
        var testList = JSON.stringify([{ id: 'ci-auth-p-001', name: 'Auth Test Patient' }]);
        localStorage.setItem(PATIENTS_KEY, testList);

        await window.denaiAuth.signOut();

        assert(localStorage.getItem(PATIENTS_KEY) === testList,
          'signOut() must NOT modify patient data — local-first invariant: auth is additive only');
      } finally {
        lsSet(PATIENTS_KEY, savedPatients);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 3 — Encryption integrity
    // Each scenario is self-contained: derives its own key, clears it on exit.
    // Relies on window.denaiNotesEnc (AES-GCM 256-bit, PBKDF2 100k SHA-256).
    // ═════════════════════════════════════════════════════════════════════════

    await run('enc:roundtrip-encrypt-decrypt-identical', async function (assert) {
      var salt = window.denaiNotesEnc.generateSalt();
      await window.denaiNotesEnc.init('ci-enc-test', salt);
      try {
        var plaintext  = 'Patient notes: implant site D1, bone graft pending';
        var ciphertext = await window.denaiNotesEnc.encrypt(plaintext);
        assert(ciphertext !== null,           'encrypt must return a non-null payload');
        assert(typeof ciphertext === 'string','encrypted payload must be a string');

        var parsed = JSON.parse(ciphertext);
        assert(parsed.v  === 1,              'payload version must be 1');
        assert(typeof parsed.iv === 'string','payload must contain iv field');
        assert(typeof parsed.ct === 'string','payload must contain ct field');

        var decrypted = await window.denaiNotesEnc.decrypt(ciphertext);
        assert(decrypted === plaintext,
          'decrypt(encrypt(x)) must return the original plaintext exactly');
      } finally {
        window.denaiNotesEnc.clearKey();
      }
    });

    await run('enc:unique-iv-per-encryption', async function (assert) {
      var salt = window.denaiNotesEnc.generateSalt();
      await window.denaiNotesEnc.init('ci-enc-test', salt);
      try {
        var plaintext = 'Same clinical notes encrypted twice';
        var ct1 = await window.denaiNotesEnc.encrypt(plaintext);
        var ct2 = await window.denaiNotesEnc.encrypt(plaintext);
        assert(ct1 !== null && ct2 !== null,
          'both encryptions must succeed');
        assert(ct1 !== ct2,
          'same plaintext encrypted twice must produce different ciphertext (12-byte random IV per operation)');
        // Both must still decrypt to the same plaintext
        var d1 = await window.denaiNotesEnc.decrypt(ct1);
        var d2 = await window.denaiNotesEnc.decrypt(ct2);
        assert(d1 === plaintext && d2 === plaintext,
          'both independently-encrypted ciphertexts must decrypt to the original plaintext');
      } finally {
        window.denaiNotesEnc.clearKey();
      }
    });

    await run('enc:wrong-passphrase-decrypt-returns-null', async function (assert) {
      var salt = window.denaiNotesEnc.generateSalt();
      // Encrypt with the CORRECT passphrase
      await window.denaiNotesEnc.init('correct-passphrase', salt);
      var ciphertext = await window.denaiNotesEnc.encrypt('Sensitive clinical notes');
      assert(ciphertext !== null, 'encryption with correct passphrase must succeed');

      // Re-init with a WRONG passphrase (same salt → different derived key)
      // PBKDF2 always succeeds; the wrong key produces a key that fails GCM auth tag check.
      var derivedOk = await window.denaiNotesEnc.init('WRONG-passphrase', salt);
      assert(derivedOk === true, 'PBKDF2 derivation always succeeds regardless of passphrase');

      var result = await window.denaiNotesEnc.decrypt(ciphertext);
      assert(result === null,
        'decrypt with wrong passphrase must return null (AES-GCM auth tag mismatch)');

      window.denaiNotesEnc.clearKey();
    });

    await run('enc:corrupt-ciphertext-decrypt-returns-null', async function (assert) {
      var salt = window.denaiNotesEnc.generateSalt();
      await window.denaiNotesEnc.init('ci-enc-test', salt);
      try {
        var ct      = await window.denaiNotesEnc.encrypt('Notes to corrupt for test');
        assert(ct !== null, 'encryption must succeed');

        // Corrupt the last 4 chars of the base64-encoded ciphertext
        var p   = JSON.parse(ct);
        p.ct    = p.ct.slice(0, -4) + 'XXXX';
        var result = await window.denaiNotesEnc.decrypt(JSON.stringify(p));
        assert(result === null,
          'corrupt ciphertext must fail safely — decrypt returns null, never throws');
      } finally {
        window.denaiNotesEnc.clearKey();
      }
    });

    await run('enc:no-key-encrypt-returns-null', async function (assert) {
      window.denaiNotesEnc.clearKey(); // explicit — no key active
      assert(window.denaiNotesEnc.hasKey() === false, 'precondition: no key initialized');
      var result = await window.denaiNotesEnc.encrypt('any clinical notes');
      assert(result === null,
        'encrypt must return null when no key is initialized');
    });

    await run('enc:no-key-decrypt-returns-null', async function (assert) {
      // Key was cleared in previous scenario — asserting the same guard
      assert(window.denaiNotesEnc.hasKey() === false, 'precondition: no key active');
      // Use a syntactically valid payload; the null return fires at the key check,
      // not at the crypto operation — both are correct failure modes.
      var result = await window.denaiNotesEnc.decrypt('{"v":1,"iv":"AAAAAAAAAAAAAAAA","ct":"AAAAAAAAAAAAAAAA"}');
      assert(result === null,
        'decrypt must return null when no key is initialized');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Group 4 — Cloud PHI safety
    // Verifies two complementary invariants:
    //   (a) plaintext notes are captured as rawNotes in the queue op but
    //       stripped from the serialized payload that goes to the cloud
    //   (b) when no encryption key is available, encrypt() returns null so
    //       the flush path correctly omits notes_enc from the Supabase row
    // ═════════════════════════════════════════════════════════════════════════

    await run('cloud:rawNotes-in-queue-op-notes-stripped-from-payload', function (assert) {
      var pid      = 'test-ci-auth-queue-001';
      var testNote = 'Implant notes: D1 site, bone graft clearance pending';
      var savedQ   = lsGet(QUEUE_KEY);
      clearQueueState();

      try {
        window.denaiSyncQueue.enqueue({
          type:      'upsert',
          patientId: pid,
          payload:   { id: pid, name: 'Auth CI Patient', notes: testNote },
        });

        var raw   = localStorage.getItem(QUEUE_KEY);
        var queue = raw ? JSON.parse(raw) : [];
        var op    = null;
        for (var i = 0; i < queue.length; i++) {
          if (queue[i].patient_id === pid) { op = queue[i]; break; }
        }

        assert(op !== null,
          'queue op must exist after enqueue');
        assert(op.rawNotes === testNote,
          'rawNotes must preserve original plaintext for encryption at flush time (Wave 7G)');
        assert(!(op.payload && 'notes' in op.payload),
          'notes must NOT appear in the serialized payload — serializer allowlist prevents PHI upload');
      } finally {
        restoreQueueState(savedQ);
      }
    });

    await run('cloud:no-key-encrypt-returns-null-confirming-notes-enc-omission', async function (assert) {
      // Key was cleared in enc:no-key-decrypt-returns-null — still cleared here.
      // This mirrors the flush-time check in syncQueue._executeOp:
      //   if (denaiNotesEnc.hasKey() && op.rawNotes) notesEnc = await encrypt(rawNotes)
      //   if (notesEnc) row.notes_enc = notesEnc   ← omitted when notesEnc is null
      assert(window.denaiNotesEnc.hasKey() === false,
        'precondition: no key initialized (passphrase not entered this session)');
      var result = await window.denaiNotesEnc.encrypt('any notes text here');
      assert(result === null,
        'encrypt returns null when no key — confirming notes_enc is omitted from Supabase row when passphrase is not entered');
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

  window.DenaiAuthRunner = Object.freeze({ runAll: runAll });

})();
