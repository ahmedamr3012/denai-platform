// ================================================================
// tests/smoke/runner.js
// Wave 5.1C-0 — DOM Smoke Runner (Tier 1: Synchronous Only)
//
// Calls render(testState) with isolated frozen state and asserts
// synchronous DOM invariants. No test hooks, no async assertions,
// no waitFor(), no timers, no frameworks.
//
// SAFETY INVARIANTS (enforced, not just documented):
//   - Never calls setState()
//   - Never calls saveState()
//   - Never touches localStorage
//   - Does not intentionally mutate S
//   - Tolerates typewriter and RAF animations in progress
//   - Restores console.error after every scenario (pass or throw)
//
// EXECUTION:
//   Option A — browser console (page already loaded):
//     Paste runner.js content, then:
//     DenaiSmokeRunner.runAll();
//
//   Option B — script include (add before </body> in index.html):
//     <script src="tests/smoke/runner.js"></script>
//     DenaiSmokeRunner.runAll();   ← call from console after page loads
// ================================================================

(function () {
  'use strict';

  // ── Guard: require render() to be in scope ────────────────────────
  if (typeof render !== 'function') {
    throw new Error(
      '[DenaiSmokeRunner] render() not found. ' +
      'Load the app page first, or add <script src="src/ai/clinicalEngine.js"> and ' +
      'the full index.html script block before this file.'
    );
  }

  // ── DOM query helpers ─────────────────────────────────────────────
  function $q(sel)  { return document.querySelector(sel); }
  function $qa(sel) { return document.querySelectorAll(sel); }

  // ── BASE state ────────────────────────────────────────────────────
  // Mirrors the BASE in tests/engine/scenarios.js — same field set,
  // same defaults. s(overrides) merges overrides onto a fresh copy.
  var BASE = {
    name: 'Smoke Test', age: 45, gender: 'Male',
    tooth: '#20', condition: 'Missing tooth',
    bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
    smoking: 'Non-smoker', diabetes: 'None',
    remainingStructure: 'Good', endodonticStatus: 'No RCT needed',
    parafunction: 'None', tx: 'implant',
    multiTooth: false, tooth2: null, abutmentQuality: 'Good',
    multiSite: false, activeSite: 1,
    site2Tooth: '#11', site2Condition: 'Missing tooth',
    site2Structure: 'Good', site2EndoStatus: 'No RCT needed',
    costImplant: 4500, costBridge: 3500, costBoneGraft: 1500,
    costCrown: 1200, costRCT: 1000, costPostCore: 400, notes: '',
  };
  function s(overrides) { return Object.assign({}, BASE, overrides); }

  // ── Assertion context ─────────────────────────────────────────────
  // Each scenario gets a fresh context. ctx.check() records pass/fail.
  function createCtx() {
    return {
      total: 0,
      failures: [],
      check: function (condition, label, detail) {
        this.total++;
        if (!condition) {
          this.failures.push(label + (detail ? ': ' + detail : ''));
        }
      },
    };
  }

  // ── Shared Tier 1 checks — all scenarios ─────────────────────────
  // Checks that are safe to assert immediately after render() returns.
  function checkCommon(ctx, ebErrors) {
    // ── Console error guard ───────────────────────────────────────
    var ebHits = ebErrors.filter(function (e) {
      return e.indexOf('[denai EB]') !== -1;
    });
    ctx.check(
      ebHits.length === 0,
      'no [denai EB] console errors',
      ebHits.length > 0 ? ebHits.join(' | ') : null
    );

    // ── Fallback guard ────────────────────────────────────────────
    var fallbacks = $qa('.card-error-fallback');
    ctx.check(
      fallbacks.length === 0,
      'no .card-error-fallback',
      fallbacks.length > 0 ? fallbacks.length + ' fallback(s) found' : null
    );

    // ── Patient panel ─────────────────────────────────────────────
    var infoDisplay = $q('#infoDisplay');
    ctx.check(infoDisplay !== null, '#infoDisplay exists');
    if (infoDisplay) {
      ctx.check(
        infoDisplay.innerHTML.trim().length > 0,
        '#infoDisplay non-empty'
      );
    }

    // ── Cost panel ────────────────────────────────────────────────
    var costContainer = $q('#costContainer');
    ctx.check(costContainer !== null, '#costContainer exists');
    if (costContainer) {
      ctx.check(
        costContainer.innerHTML.trim().length > 0,
        '#costContainer non-empty'
      );
    }

    // ── Recommendation banner ─────────────────────────────────────
    ctx.check($q('#recBanner') !== null, '#recBanner exists');

    // ── Confidence ring (tolerates mid-RAF animation) ─────────────
    // animateNumber starts dashoffset at the circumference value then
    // animates to the target. Either way it is a finite number.
    var ring = $q('#ringFill');
    ctx.check(ring !== null, '#ringFill exists');
    if (ring) {
      var dashRaw  = ring.style.strokeDashoffset ||
                     ring.getAttribute('stroke-dashoffset') || '';
      var dashNum  = parseFloat(dashRaw);
      ctx.check(
        Number.isFinite(dashNum),
        '#ringFill stroke-dashoffset finite',
        'got: "' + dashRaw + '"'
      );
    }

    // ── Confidence value (tolerates mid-RAF animation) ────────────
    // Before RAF fires, textContent may show the previous value or '0'.
    // Either way it must be non-empty.
    var confVal = $q('#confVal');
    ctx.check(confVal !== null, '#confVal exists');
    if (confVal) {
      var confText = confVal.textContent.trim();
      ctx.check(confText.length > 0, '#confVal non-empty');
      ctx.check(
        !isNaN(parseInt(confText, 10)),
        '#confVal numeric',
        'got: "' + confText + '"'
      );
    }

    // ── Success bar (tolerates mid-RAF animation) ─────────────────
    // Width is typically initialised to '0%' synchronously before
    // the RAF sequence begins, so parseFloat('0%') === 0 (finite).
    var successBar = $q('#successBar');
    ctx.check(successBar !== null, '#successBar exists');
    if (successBar) {
      var barWidth = parseFloat(successBar.style.width);
      ctx.check(
        Number.isFinite(barWidth),
        '#successBar width finite',
        'got: "' + successBar.style.width + '"'
      );
    }
  }

  // ── Missing-tooth risk section visibility ─────────────────────────
  // For missing-tooth scenarios (calcAI / calcAIMulti path):
  //   #implantRiskSection — must be visible
  //   #crownRiskSection   — must be hidden
  function checkMissingToothRisk(ctx) {
    var implantRisk = $q('#implantRiskSection');
    var crownRisk   = $q('#crownRiskSection');

    ctx.check(implantRisk !== null, '#implantRiskSection exists');
    if (implantRisk) {
      ctx.check(
        getComputedStyle(implantRisk).display !== 'none',
        '#implantRiskSection visible'
      );
    }

    ctx.check(crownRisk !== null, '#crownRiskSection exists');
    if (crownRisk) {
      ctx.check(
        getComputedStyle(crownRisk).display === 'none',
        '#crownRiskSection hidden'
      );
    }
  }

  // ── Graph SVG — active scenarios (implant / bridge) ───────────────
  // renderGraph() renders an SVG into #graphContainer for single-tooth
  // missing cases. Asserts: SVG present, no NaN values in markup.
  function checkGraphActive(ctx) {
    var graphContainer = $q('#graphContainer');
    ctx.check(graphContainer !== null, '#graphContainer exists');
    if (graphContainer) {
      var svg = graphContainer.querySelector('svg');
      ctx.check(svg !== null, '#graphContainer contains SVG');
      if (svg) {
        ctx.check(
          svg.innerHTML.indexOf('NaN') === -1,
          'graph SVG contains no NaN'
        );
      }
    }
  }

  // ── Graph container — early-return modes (restorative) ───────────
  // renderGraph() returns early for treatmentMode==='restorative'
  // without clearing #graphContainer. The container must NOT contain
  // an .empty-state element (which would indicate an error path).
  function checkGraphEarlyReturn(ctx) {
    var graphContainer = $q('#graphContainer');
    if (graphContainer) {
      ctx.check(
        graphContainer.querySelector('.empty-state') === null,
        '#graphContainer no .empty-state (graph early-return)'
      );
    }
  }

  // ── Scenario definitions ──────────────────────────────────────────
  var SCENARIOS = [
    {
      // Single missing tooth, posterior mandibular, optimal conditions.
      // Expected: implant recommendation, implant risk section, SVG graph.
      id: 'smoke-implant',
      state: s({ tooth: '#20', tx: 'implant' }),
      run: function (ctx, ebErrors) {
        checkCommon(ctx, ebErrors);
        checkMissingToothRisk(ctx);
        checkGraphActive(ctx);

        // TX card: #cardImplant must carry the 'active' class
        // (renderTxCards single-tooth path uses state.tx for active card)
        var cardImplant = $q('#cardImplant');
        ctx.check(cardImplant !== null, '#cardImplant exists');
        if (cardImplant) {
          ctx.check(
            cardImplant.classList.contains('active'),
            '#cardImplant has class "active" (tx=implant)'
          );
        }
      },
    },

    {
      // Missing anterior maxillary tooth, fair bone + smoker.
      // Expected: bridge recommendation, implant risk section, SVG graph.
      // Smoker + fair bone shifts calcAI rec from implant to bridge for #6.
      id: 'smoke-bridge',
      state: s({ tooth: '#6', bone: 'Fair', smoking: 'Current smoker', tx: 'bridge' }),
      run: function (ctx, ebErrors) {
        checkCommon(ctx, ebErrors);
        checkMissingToothRisk(ctx);
        checkGraphActive(ctx);

        // TX card: #cardBridge must carry the 'active' class
        var cardBridge = $q('#cardBridge');
        ctx.check(cardBridge !== null, '#cardBridge exists');
        if (cardBridge) {
          ctx.check(
            cardBridge.classList.contains('active'),
            '#cardBridge has class "active" (tx=bridge)'
          );
        }
      },
    },

    {
      // Fractured posterior tooth, viable restoration candidate.
      // Expected: restorative path, crown risk section, graph returns early.
      id: 'smoke-restorative-viable',
      state: s({ tooth: '#30', condition: 'Fractured tooth', tx: 'crown' }),
      run: function (ctx, ebErrors) {
        checkCommon(ctx, ebErrors);

        // Restorative risk visibility: crown visible, implant hidden
        var crownRisk   = $q('#crownRiskSection');
        var implantRisk = $q('#implantRiskSection');

        ctx.check(crownRisk !== null, '#crownRiskSection exists');
        if (crownRisk) {
          ctx.check(
            getComputedStyle(crownRisk).display !== 'none',
            '#crownRiskSection visible'
          );
        }

        ctx.check(implantRisk !== null, '#implantRiskSection exists');
        if (implantRisk) {
          ctx.check(
            getComputedStyle(implantRisk).display === 'none',
            '#implantRiskSection hidden'
          );
        }

        // Graph early-return: no .empty-state
        checkGraphEarlyReturn(ctx);

        // At least one .opt-card carries the 'active' class
        // (renderRestorativeTxCards creates its own card set)
        ctx.check(
          $q('.opt-card.active') !== null,
          'at least one .opt-card.active exists'
        );
      },
    },
  ];

  // ── runSmokeScenario ──────────────────────────────────────────────
  function runSmokeScenario(scenario) {
    var capturedErrors = [];
    var origConsoleError = console.error;

    // Intercept console.error to capture EB messages.
    // Always restores original — even if render() throws.
    console.error = function () {
      capturedErrors.push(
        Array.prototype.slice.call(arguments).join(' ')
      );
      origConsoleError.apply(console, arguments);
    };

    var ctx = createCtx();

    try {
      // Frozen isolated state — same pattern as engine regression runner.
      // render() and all downstream render functions read-only from state.
      var testState = Object.freeze(Object.assign({}, scenario.state));
      render(testState);
    } catch (err) {
      console.error = origConsoleError;
      return {
        id: scenario.id,
        pass: false,
        failures: ['render() threw: ' + (err.message || String(err))],
        assertionCount: 0,
      };
    }

    // Restore before assertions so any accidental console.error calls
    // inside the check helpers surface normally.
    console.error = origConsoleError;

    // Run scenario-specific Tier 1 checks.
    scenario.run(ctx, capturedErrors);

    return {
      id:             scenario.id,
      pass:           ctx.failures.length === 0,
      failures:       ctx.failures,
      assertionCount: ctx.total,
    };
  }

  // ── runAllScenarios ───────────────────────────────────────────────
  function runAllScenarios(scenarios) {
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      console.error('[DenaiSmokeRunner] No scenarios to run.');
      return null;
    }

    var passed           = 0;
    var failed           = 0;
    var totalAssertions  = 0;
    var results          = [];

    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log('  denai DOM Smoke Runner — Wave 5.1C-0        ');
    console.log('══════════════════════════════════════════════');
    console.log('');

    for (var i = 0; i < scenarios.length; i++) {
      var scenario = scenarios[i];
      var result   = runSmokeScenario(scenario);
      results.push(result);
      totalAssertions += result.assertionCount;

      if (result.pass) {
        passed++;
        console.log('PASS ' + result.id);
      } else {
        failed++;
        console.log('FAIL ' + result.id);
        for (var j = 0; j < result.failures.length; j++) {
          console.log('  ' + result.failures[j]);
        }
      }
    }

    console.log('');
    console.log('──────────────────────────────────────────────');
    console.log('Summary:');
    console.log('  ' + passed  + ' passed');
    console.log('  ' + failed  + ' failed');
    console.log('  ' + totalAssertions + ' assertions across ' + scenarios.length + ' scenarios');
    console.log('──────────────────────────────────────────────');
    console.log('');

    return {
      passed:           passed,
      failed:           failed,
      total:            scenarios.length,
      totalAssertions:  totalAssertions,
      results:          results,
    };
  }

  // ── Public API ────────────────────────────────────────────────────
  var DenaiSmokeRunner = {
    // Run the full 3-scenario Tier 1 smoke suite.
    runAll: function () {
      return runAllScenarios(SCENARIOS);
    },

    // Run a single smoke scenario by id (useful when debugging one failure).
    runOne: function (id) {
      var scenario = null;
      for (var i = 0; i < SCENARIOS.length; i++) {
        if (SCENARIOS[i].id === id) { scenario = SCENARIOS[i]; break; }
      }
      if (!scenario) {
        console.error('[DenaiSmokeRunner] Scenario not found: ' + id);
        return null;
      }
      return runAllScenarios([scenario]);
    },

    // Expose internals for debugging without running the full suite.
    _scenarios:          SCENARIOS,
    _runSmokeScenario:   runSmokeScenario,
    _createCtx:          createCtx,
  };

  if (typeof window !== 'undefined') window.DenaiSmokeRunner = DenaiSmokeRunner;

}());
