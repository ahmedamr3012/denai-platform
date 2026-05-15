// ================================================================
// tests/engine/scenarios.js
// Wave 5.1B — Engine Regression Scenario Registry
//
// Pure data. No side effects. No DOM. No ClinicalEngine calls.
// Each scenario is fully self-contained: state provides every
// field that calcAI / calcAIMulti / ClinicalEngine.process reads.
//
// Expected values were derived by hand-tracing the scoring logic
// against the exact state provided. They are deterministic — given
// the same state the engine always returns the same result.
//
// Assertion types supported by runner.js:
//   eq      — strict equality at a dotted path
//   finite  — Number.isFinite(value) at a dotted path
//   range   — value >= min && value <= max
//   minLen  — array.length >= min
//   notNull — value != null
//   noNaN   — all listed dotted paths are finite numbers
// ================================================================

(function () {
  'use strict';

  // Base state covers every field ClinicalEngine / calcAI reads.
  // Scenarios override only the fields relevant to their clinical context.
  var BASE = {
    name: 'Test', age: 45, gender: 'Male',
    tooth: '#6', condition: 'Missing tooth',
    bone: 'Good', hygiene: 'Good',
    occlusion: 'Normal',
    smoking: 'Non-smoker', diabetes: 'None',
    remainingStructure: 'Good', endodonticStatus: 'No RCT needed',
    parafunction: 'None',
    tx: 'implant',
    multiTooth: false, tooth2: null, abutmentQuality: 'Good',
    multiSite: false, activeSite: 1,
    site2Tooth: '#11', site2Condition: 'Missing tooth',
    site2Structure: 'Good', site2EndoStatus: 'No RCT needed',
    costImplant: 4500, costBridge: 3500, costBoneGraft: 1500,
    costCrown: 1200, costRCT: 1000, costPostCore: 400,
    notes: '',
  };

  function s(overrides) {
    return Object.assign({}, BASE, overrides);
  }

  // ── Scenario registry ─────────────────────────────────────────────
  //
  // Derivation notes for each expected value are inline so that a
  // future reader can verify without re-running the engine.

  var SCENARIOS = [

    // ── 1. implant-good-bone ─────────────────────────────────────────
    // Ideal single-tooth missing-tooth candidate.
    // calcAI hand-trace (tooth #6, maxilla anterior):
    //   implant: 96.4 +0.8(good bone) +0.5(hygiene) +0.3(non-smoker)
    //            +0.3(no DM) +0.4(normal occ) -1.5(maxilla ant) = 97.2
    //   bridge:  88.0 +0.5(maxilla ant)                           = 88.5
    //   crown:   0 (Missing tooth — crownViable = false)
    //   rec: implant (97.2 > 88.5)   conf: 76+2 = 78
    {
      id: 'implant-good-bone',
      description: 'Ideal implant candidate — single missing tooth, good bone, no risk factors',
      mode: 'process',
      state: s({
        tooth: '#6', condition: 'Missing tooth',
        bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'None', age: 45,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'implant'         },
        { type: 'eq',     path: 'treatmentMode',  expected: 'single'          },
        { type: 'eq',     path: 'caseClass.type', expected: 'MISSING_SINGLE'  },
        { type: 'finite', path: 'implant'                                      },
        { type: 'finite', path: 'bridge'                                       },
        { type: 'range',  path: 'implant', min: 85, max: 99                   },
        { type: 'range',  path: 'bridge',  min: 50, max: 95                   },
        { type: 'range',  path: 'conf',    min: 35, max: 95                   },
        { type: 'minLen', path: 'reasons', min: 1                              },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'conf']                 },
      ],
    },

    // ── 2. bridge-fair-bone ──────────────────────────────────────────
    // Fair bone combined with current smoker tips the balance toward bridge.
    // calcAI hand-trace (tooth #6, maxilla anterior):
    //   implant: 96.4 -4.2(fair) +0.5 -8.5(smoker) +0.3 +0.4 -1.5 = 83.4
    //   bridge:  88.0 +0.5(fair) -2.0(smoker) +0.5(maxilla ant)     = 87.0
    //   rec: bridge (87.0 > 83.4)   conf: 76-10-12 = 54
    {
      id: 'bridge-fair-bone',
      description: 'Fair bone + current smoker — bridge outscores implant',
      mode: 'process',
      state: s({
        tooth: '#6', condition: 'Missing tooth',
        bone: 'Fair', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Current smoker', diabetes: 'None', age: 45,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'bridge'          },
        { type: 'eq',     path: 'treatmentMode',  expected: 'single'          },
        { type: 'eq',     path: 'caseClass.type', expected: 'MISSING_SINGLE'  },
        { type: 'finite', path: 'implant'                                      },
        { type: 'finite', path: 'bridge'                                       },
        { type: 'range',  path: 'conf',    min: 35, max: 95                   },
        { type: 'minLen', path: 'reasons', min: 1                              },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'conf']                 },
      ],
    },

    // ── 3. smoker-implant ────────────────────────────────────────────
    // Current smoker but good mandibular posterior bone still favours implant.
    // calcAI hand-trace (tooth #20, mandible posterior, age 35):
    //   implant: 96.4 +0.8 +0.5 -8.5(smoker) +0.3 +0.4 -0.5(mand post)
    //            +0.6(age<40) = 90.0
    //   bridge:  88.0 -2.0(smoker) -2.2(mand post) +0.3(age<40)     = 84.1
    //   rec: implant (90.0 > 84.1)   conf: 76+2+1-12 = 67
    {
      id: 'smoker-implant',
      description: 'Current smoker — implant still preferred with good bone at mandibular site',
      mode: 'process',
      state: s({
        tooth: '#20', condition: 'Missing tooth',
        bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Current smoker', diabetes: 'None', age: 35,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'implant'         },
        { type: 'eq',     path: 'treatmentMode',  expected: 'single'          },
        { type: 'eq',     path: 'caseClass.type', expected: 'MISSING_SINGLE'  },
        { type: 'finite', path: 'implant'                                      },
        { type: 'finite', path: 'bridge'                                       },
        { type: 'range',  path: 'conf',    min: 35, max: 95                   },
        { type: 'minLen', path: 'reasons', min: 1                              },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'conf']                 },
      ],
    },

    // ── 4. diabetic-uncontrolled ─────────────────────────────────────
    // Uncontrolled DM reduces implant score but implant still wins with good bone.
    // calcAI hand-trace (tooth #6, maxilla anterior):
    //   implant: 96.4 +0.8 +0.5 +0.3(non-smoker) -7.0(uncontrolled DM)
    //            +0.4 -1.5 = 89.9
    //   bridge:  88.0 -2.0(uncontrolled DM) +0.5(maxilla ant) = 86.5
    //   rec: implant (89.9 > 86.5)   conf: 76+2-12 = 66
    {
      id: 'diabetic-uncontrolled',
      description: 'Uncontrolled diabetes — implant score penalised but still preferred over bridge',
      mode: 'process',
      state: s({
        tooth: '#6', condition: 'Missing tooth',
        bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'Uncontrolled', age: 45,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'implant'         },
        { type: 'eq',     path: 'treatmentMode',  expected: 'single'          },
        { type: 'eq',     path: 'caseClass.type', expected: 'MISSING_SINGLE'  },
        { type: 'finite', path: 'implant'                                      },
        { type: 'finite', path: 'bridge'                                       },
        { type: 'range',  path: 'conf',    min: 35, max: 95                   },
        { type: 'minLen', path: 'reasons', min: 1                              },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'conf']                 },
      ],
    },

    // ── 5. poor-bone-implant ─────────────────────────────────────────
    // Poor bone at a mandibular posterior site: implant score drops heavily but
    // bridge drops too (abutment stress), implant still edges ahead by 0.6.
    // calcAI hand-trace (tooth #20, mandible posterior):
    //   implant: 96.4 -12.5 +0.5 +0.3 +0.3 +0.4 -0.5(mand post) = 84.9
    //   bridge:  88.0 -1.5(poor bone) -2.2(mand post)              = 84.3
    //   rec: implant (84.9 > 84.3)   conf: 76-22 = 54 (Low)
    {
      id: 'poor-bone-implant',
      description: 'Poor bone — both scores suppressed; implant edges bridge at mandibular posterior',
      mode: 'process',
      state: s({
        tooth: '#20', condition: 'Missing tooth',
        bone: 'Poor', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'None', age: 45,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'implant'         },
        { type: 'eq',     path: 'treatmentMode',  expected: 'single'          },
        { type: 'eq',     path: 'caseClass.type', expected: 'MISSING_SINGLE'  },
        { type: 'finite', path: 'implant'                                      },
        { type: 'finite', path: 'bridge'                                       },
        // conf is 54 in this scenario — confLevel = 'Low'
        { type: 'range',  path: 'conf',    min: 35, max: 65                   },
        { type: 'minLen', path: 'reasons', min: 1                              },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'conf']                 },
      ],
    },

    // ── 6. restorative-viable ────────────────────────────────────────
    // Fractured tooth, good structure, vital pulp, good bone — VIABLE prognosis.
    // ClinicalEngine 7-stage pipeline (tooth #30, mandible posterior):
    //   classify → RESTORATIVE_VIABLE (goodStructure, no bruxism, no poorBone)
    //   generateTreatments: onlay (slot implant), crown (slot bridge), crown_adv (slot crown)
    //   scoreRestorative: onlay=95.0 (ceiling), crown=96.0, crown_adv=96.0
    //   recommend: ideal='bridge' (first of two tied 96.0s in stable sort)
    //   rec: 'bridge'   treatmentMode: 'restorative'
    {
      id: 'restorative-viable',
      description: 'Fractured tooth, good prognosis — RESTORATIVE_VIABLE, crown (bridge slot) recommended',
      mode: 'process',
      state: s({
        tooth: '#30', condition: 'Fractured tooth',
        bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'None',
        remainingStructure: 'Good', endodonticStatus: 'No RCT needed',
        parafunction: 'None', age: 45,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'bridge'              },
        { type: 'eq',     path: 'treatmentMode',  expected: 'restorative'         },
        { type: 'eq',     path: 'caseClass.type', expected: 'RESTORATIVE_VIABLE'  },
        { type: 'finite', path: 'implant'                                          },
        { type: 'finite', path: 'bridge'                                           },
        { type: 'finite', path: 'crown'                                            },
        { type: 'range',  path: 'implant', min: 50, max: 99                       },
        { type: 'range',  path: 'bridge',  min: 50, max: 99                       },
        { type: 'range',  path: 'crown',   min: 50, max: 99                       },
        { type: 'range',  path: 'conf',    min: 35, max: 95                       },
        { type: 'minLen', path: 'reasons', min: 1                                  },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'crown', 'conf']            },
      ],
    },

    // ── 7. restorative-hopeless ──────────────────────────────────────
    // Poor structure + poor bone + bruxism + RCT needed → HOPELESS classification.
    // ClinicalEngine 7-stage pipeline (tooth #30, mandible posterior):
    //   classify: poorStructure && (poorBone || bruxism || needsRCT) → RESTORATIVE_HOPELESS
    //   generateTreatments: crown_core (implant slot), splinted (bridge slot), extract_impl (crown slot)
    //   scoreRestorative:
    //     crown_core: 87.0 -18(hopeless penalty) = 69.0
    //     splinted:   83.5 +3.0(bruxism) +2.5(poorFerrule) -18(hopeless) = 71.0
    //     extract_impl: baseAI.implant(84.9) -5.0(poorBone) → max(79.9, 70 floor) = 79.9
    //   recommend: allowPreservationBias=false (HOPELESS) → rec=ideal='crown' (extract_impl slot)
    {
      id: 'restorative-hopeless',
      description: 'Hopeless prognosis — poor structure + poor bone + bruxism forces extraction path',
      mode: 'process',
      state: s({
        tooth: '#30', condition: 'Fractured tooth',
        bone: 'Poor', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'None',
        remainingStructure: 'Poor', endodonticStatus: 'Needs RCT',
        parafunction: 'Bruxism', age: 45,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'crown'               },
        { type: 'eq',     path: 'treatmentMode',  expected: 'restorative'         },
        { type: 'eq',     path: 'caseClass.type', expected: 'RESTORATIVE_HOPELESS'},
        { type: 'finite', path: 'implant'                                          },
        { type: 'finite', path: 'bridge'                                           },
        { type: 'finite', path: 'crown'                                            },
        // Hopeless slot scores are suppressed — all should be < 85
        { type: 'range',  path: 'implant', min: 50, max: 84                       },
        { type: 'range',  path: 'bridge',  min: 50, max: 84                       },
        // extract_impl slot (crown field) should score highest in hopeless case
        { type: 'range',  path: 'crown',   min: 65, max: 99                       },
        { type: 'range',  path: 'conf',    min: 35, max: 95                       },
        { type: 'minLen', path: 'reasons', min: 1                                  },
        { type: 'noNaN',  paths: ['implant', 'bridge', 'crown', 'conf']            },
      ],
    },

    // ── 8. multi-tooth-two-implants ──────────────────────────────────
    // Two adjacent missing teeth (#5 + #6), compromised abutments → implant2 wins.
    // calcAIMulti hand-trace (maxilla posterior, age 30, youngGoodBone):
    //   implant2: 94 +1.6(goodBone×2) +4.0(youngGoodBone) +5.0(abutComp) -3.0(maxPost)
    //             → clamped to 99.0
    //   bridge4:  86.0 -12.0(abutComp) → 74.0
    //   bridgeIsReasonable: 74 < 80 → false → rec = ideal = 'implant2'
    {
      id: 'multi-tooth-two-implants',
      description: 'Two adjacent missing teeth, compromised abutments — 2-implant recommendation',
      mode: 'process',
      state: s({
        tooth: '#5', condition: 'Missing tooth',
        multiTooth: true, tooth2: '#6', abutmentQuality: 'Compromised',
        bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'None', age: 30,
      }),
      assertions: [
        { type: 'eq',     path: 'rec',            expected: 'implant2'        },
        { type: 'eq',     path: 'treatmentMode',  expected: 'multi'           },
        { type: 'eq',     path: 'isMultiTooth',   expected: true              },
        { type: 'eq',     path: 'caseClass.type', expected: 'MISSING_MULTI'   },
        { type: 'finite', path: 'implant2'                                     },
        { type: 'finite', path: 'bridge4'                                      },
        { type: 'finite', path: 'cantilever'                                   },
        { type: 'range',  path: 'implant2',   min: 50, max: 99                },
        { type: 'range',  path: 'bridge4',    min: 50, max: 95                },
        { type: 'range',  path: 'cantilever', min: 40, max: 90                },
        { type: 'range',  path: 'conf',       min: 35, max: 95                },
        { type: 'minLen', path: 'reasons',    min: 1                          },
        { type: 'noNaN',  paths: ['implant2', 'bridge4', 'cantilever', 'conf']},
      ],
    },

    // ── 9. compound-two-sites ────────────────────────────────────────
    // Two independent clinical sites:
    //   Site 1 — #6 missing tooth (single) → calcAI → rec='implant'
    //   Site 2 — #30 fractured tooth, good structure (restorative) → pipeline → rec='bridge'
    // Tests processCompound routing + effective-state derivation for both sites.
    {
      id: 'compound-two-sites',
      description: 'Compound case: missing tooth (site 1) + viable restorative (site 2)',
      mode: 'compound',
      state: s({
        tooth: '#6', condition: 'Missing tooth',
        bone: 'Good', hygiene: 'Good', occlusion: 'Normal',
        smoking: 'Non-smoker', diabetes: 'None', age: 45,
        multiSite: true,
        site2Tooth: '#30', site2Condition: 'Fractured tooth',
        site2Structure: 'Good', site2EndoStatus: 'No RCT needed',
      }),
      assertions: [
        { type: 'eq',      path: 'isCompound',              expected: true               },
        { type: 'notNull', path: 'site1'                                                  },
        { type: 'notNull', path: 'site2'                                                  },
        { type: 'eq',      path: 'site1.treatmentMode',     expected: 'single'           },
        { type: 'eq',      path: 'site1.caseClass.type',    expected: 'MISSING_SINGLE'   },
        { type: 'eq',      path: 'site1.rec',               expected: 'implant'          },
        { type: 'eq',      path: 'site2.treatmentMode',     expected: 'restorative'      },
        { type: 'eq',      path: 'site2.caseClass.type',    expected: 'RESTORATIVE_VIABLE'},
        { type: 'eq',      path: 'site2.rec',               expected: 'bridge'           },
        { type: 'finite',  path: 'site1.implant'                                          },
        { type: 'finite',  path: 'site1.bridge'                                           },
        { type: 'finite',  path: 'site2.implant'                                          },
        { type: 'finite',  path: 'site2.bridge'                                           },
        { type: 'noNaN',   paths: ['site1.implant', 'site1.bridge', 'site1.conf',
                                   'site2.implant', 'site2.bridge', 'site2.conf']        },
      ],
    },

  ]; // end SCENARIOS

  // Expose globally so runner.js and browser console can access it.
  // Using var assignment (not const) so the variable can be re-declared
  // safely if this script is re-evaluated in the same console session.
  if (typeof window !== 'undefined') window.DENAI_SCENARIOS = SCENARIOS;

}());
