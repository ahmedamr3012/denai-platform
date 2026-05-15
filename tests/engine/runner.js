// ================================================================
// tests/engine/runner.js
// Wave 5.1B — Engine Regression Runner
//
// Executes deterministic ClinicalEngine.process / processCompound
// assertions against the scenario registry in scenarios.js.
//
// SAFETY INVARIANTS (enforced, not just documented):
//   - Never reads or writes the global S object
//   - Never calls render(), renderMainPanels(), setState()
//   - Never touches localStorage
//   - Never modifies DOM
//   - All engine calls use isolated scenario.state copies
//
// EXECUTION:
//   Option A — browser console (page already loaded):
//     Paste scenarios.js content, then paste runner.js content, then:
//     DenaiEngineRunner.runAll();
//
//   Option B — temporary script include (add before </body> in index.html):
//     <script src="tests/engine/scenarios.js"></script>
//     <script src="tests/engine/runner.js"></script>
//     DenaiEngineRunner.runAll();   ← call from console after page loads
// ================================================================

(function () {
  'use strict';

  // ── Guard: require ClinicalEngine to be in scope ─────────────────
  // ClinicalEngine is declared as `const` at the top level of
  // src/ai/clinicalEngine.js (a classic script), making it available
  // in the global environment for any subsequent script or console code.
  if (typeof ClinicalEngine === 'undefined') {
    throw new Error(
      '[DenaiEngineRunner] ClinicalEngine not found. ' +
      'Load the app page first, or add <script src="src/ai/clinicalEngine.js"> ' +
      'after src/ai/calcAI.js.'
    );
  }

  // ── Utility: navigate a dotted path through an object ────────────
  // getPath({ a: { b: 1 } }, 'a.b') → 1
  // Returns undefined for missing segments rather than throwing.
  function getPath(obj, path) {
    if (obj == null || !path) return obj;
    return path.split('.').reduce(function (o, key) {
      return o == null ? undefined : o[key];
    }, obj);
  }

  // ── Core: evaluate a single assertion against an AI result ────────
  // Returns { pass: boolean, message: string | null }
  // message is null on pass; a human-readable failure description on fail.
  function runAssertion(ai, assertion) {
    var type = assertion.type;

    if (type === 'eq') {
      var actual = getPath(ai, assertion.path);
      var pass = actual === assertion.expected;
      return {
        pass: pass,
        message: pass ? null :
          'eq: ' + assertion.path + '\n' +
          '    expected: ' + JSON.stringify(assertion.expected) + '\n' +
          '    got:      ' + JSON.stringify(actual),
      };
    }

    if (type === 'finite') {
      var val = getPath(ai, assertion.path);
      var ok = Number.isFinite(val);
      return {
        pass: ok,
        message: ok ? null :
          'finite: ' + assertion.path + ' = ' + val + ' (not a finite number)',
      };
    }

    if (type === 'range') {
      var v = getPath(ai, assertion.path);
      var inRange = typeof v === 'number' && v >= assertion.min && v <= assertion.max;
      return {
        pass: inRange,
        message: inRange ? null :
          'range: ' + assertion.path + ' = ' + v +
          ' — expected [' + assertion.min + ', ' + assertion.max + ']',
      };
    }

    if (type === 'minLen') {
      var arr = getPath(ai, assertion.path);
      var len = Array.isArray(arr) ? arr.length : -1;
      var lengthOk = len >= assertion.min;
      return {
        pass: lengthOk,
        message: lengthOk ? null :
          'minLen: ' + assertion.path + '.length = ' + len +
          ' — expected >= ' + assertion.min,
      };
    }

    if (type === 'notNull') {
      var target = getPath(ai, assertion.path);
      var notNull = target != null;
      return {
        pass: notNull,
        message: notNull ? null :
          'notNull: ' + assertion.path + ' is ' + target,
      };
    }

    if (type === 'noNaN') {
      var failures = [];
      for (var i = 0; i < assertion.paths.length; i++) {
        var p = assertion.paths[i];
        var n = getPath(ai, p);
        if (!Number.isFinite(n)) {
          failures.push(p + ' = ' + n);
        }
      }
      return {
        pass: failures.length === 0,
        message: failures.length === 0 ? null :
          'noNaN: ' + failures.join(', '),
      };
    }

    return {
      pass: false,
      message: 'unknown assertion type: "' + type + '"',
    };
  }

  // ── runScenario: execute one scenario, return structured result ───
  function runScenario(scenario) {
    // Freeze a copy of the state so no engine call can mutate it.
    var frozenState = Object.freeze(Object.assign({}, scenario.state));

    var ai;
    var engineError = null;

    try {
      if (scenario.mode === 'compound') {
        ai = ClinicalEngine.processCompound(frozenState);
      } else {
        ai = ClinicalEngine.process(frozenState);
      }
    } catch (err) {
      engineError = err;
      ai = null;
    }

    // If the engine threw or returned null, every assertion fails.
    if (engineError || ai == null) {
      var nullMessage = engineError
        ? 'engine threw: ' + (engineError.message || String(engineError))
        : 'engine returned null (invalid state or missing required fields)';
      var nullFailures = scenario.assertions.map(function (a, idx) {
        return '[' + (idx + 1) + '] ' + nullMessage;
      });
      return {
        id: scenario.id,
        pass: false,
        failures: nullFailures,
        assertionCount: scenario.assertions.length,
      };
    }

    // Run each assertion in sequence.
    var failures = [];
    for (var i = 0; i < scenario.assertions.length; i++) {
      var result = runAssertion(ai, scenario.assertions[i]);
      if (!result.pass) {
        failures.push('[' + (i + 1) + '] ' + result.message);
      }
    }

    return {
      id: scenario.id,
      pass: failures.length === 0,
      failures: failures,
      assertionCount: scenario.assertions.length,
    };
  }

  // ── runAllScenarios: execute registry, print summary ─────────────
  function runAllScenarios(scenarios) {
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      console.error('[DenaiEngineRunner] No scenarios provided. ' +
        'Load tests/engine/scenarios.js first.');
      return null;
    }

    var passed = 0;
    var failed = 0;
    var totalAssertions = 0;
    var results = [];

    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log('  denai Engine Regression Runner — Wave 5.1B  ');
    console.log('══════════════════════════════════════════════');
    console.log('');

    for (var i = 0; i < scenarios.length; i++) {
      var scenario = scenarios[i];
      var result = runScenario(scenario);
      results.push(result);
      totalAssertions += result.assertionCount;

      if (result.pass) {
        passed++;
        console.log('PASS ' + result.id);
      } else {
        failed++;
        console.log('FAIL ' + result.id);
        for (var j = 0; j < result.failures.length; j++) {
          // Indent each failure line for readability.
          var lines = result.failures[j].split('\n');
          for (var k = 0; k < lines.length; k++) {
            console.log('  ' + lines[k]);
          }
        }
      }
    }

    console.log('');
    console.log('──────────────────────────────────────────────');
    console.log('Summary:');
    console.log('  ' + passed + ' passed');
    console.log('  ' + failed + ' failed');
    console.log('  ' + totalAssertions + ' assertions across ' + scenarios.length + ' scenarios');
    console.log('──────────────────────────────────────────────');
    console.log('');

    return {
      passed: passed,
      failed: failed,
      total: scenarios.length,
      totalAssertions: totalAssertions,
      results: results,
    };
  }

  // ── Public API ────────────────────────────────────────────────────
  var DenaiEngineRunner = {
    // Run all scenarios from the global registry (loaded by scenarios.js).
    runAll: function () {
      var registry = (typeof window !== 'undefined' && window.DENAI_SCENARIOS)
        || (typeof DENAI_SCENARIOS !== 'undefined' && DENAI_SCENARIOS)
        || null;
      if (!registry) {
        console.error('[DenaiEngineRunner] DENAI_SCENARIOS not found. ' +
          'Load tests/engine/scenarios.js first.');
        return null;
      }
      return runAllScenarios(registry);
    },

    // Run a single scenario by id (useful for debugging one failure).
    runOne: function (id) {
      var registry = (typeof window !== 'undefined' && window.DENAI_SCENARIOS)
        || (typeof DENAI_SCENARIOS !== 'undefined' && DENAI_SCENARIOS)
        || [];
      var scenario = null;
      for (var i = 0; i < registry.length; i++) {
        if (registry[i].id === id) { scenario = registry[i]; break; }
      }
      if (!scenario) {
        console.error('[DenaiEngineRunner] Scenario not found: ' + id);
        return null;
      }
      return runAllScenarios([scenario]);
    },

    // Run assertions against a pre-computed AI result (for ad-hoc testing).
    // Example: DenaiEngineRunner.assert(ClinicalEngine.process(myState), assertions)
    assert: function (ai, assertions) {
      var failures = [];
      for (var i = 0; i < assertions.length; i++) {
        var r = runAssertion(ai, assertions[i]);
        if (!r.pass) failures.push('[' + (i + 1) + '] ' + r.message);
      }
      if (failures.length === 0) {
        console.log('PASS (' + assertions.length + ' assertions)');
      } else {
        console.log('FAIL (' + failures.length + '/' + assertions.length + ' failed)');
        failures.forEach(function (f) { console.log('  ' + f); });
      }
      return failures.length === 0;
    },

    // Expose internals for debugging without running full suite.
    _runScenario:  runScenario,
    _runAssertion: runAssertion,
    _getPath:      getPath,
  };

  if (typeof window !== 'undefined') window.DenaiEngineRunner = DenaiEngineRunner;

}());
