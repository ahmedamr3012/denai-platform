  function isPosteriorTooth(tooth) {
    const n = parseInt(tooth.replace('#',''),10);
    return (n>=1&&n<=5)||(n>=12&&n<=16)||(n>=17&&n<=21)||(n>=28&&n<=32);
  }
  function isMaxilla(tooth) {
    const n = parseInt(tooth.replace('#',''),10);
    return n >= 1 && n <= 16; // #1-16 = Upper jaw (Maxilla), #17-32 = Lower jaw (Mandible)
  }

  // ================================================================
  // MODULE: ai.js — Pure AI calculation engine (no DOM access)
  // ================================================================
  // PURE LOGIC: AI CALCULATION
  // ================================================================
  // ── Multi-tooth helpers ────────────────────────────────────
  function isAdjacent(t1, t2) {
    const n1 = parseInt(t1.replace('#',''), 10);
    const n2 = parseInt(t2.replace('#',''), 10);
    if (Math.abs(n1 - n2) !== 1) return false;
    // #16 (upper-left wisdom) and #17 (lower-left wisdom) are on opposite arches
    // and are NOT clinically adjacent despite being numerically consecutive
    if ((n1 === 16 && n2 === 17) || (n1 === 17 && n2 === 16)) return false;
    return true;
  }

  function getAdjacentTeeth(tooth) {
    const n = parseInt(tooth.replace('#',''), 10);
    const adj = [];
    // Block #16→#17 and #17→#16 cross-arch adjacency (opposite jaw arches)
    if (n > 1  && !(n === 17)) adj.push('#' + (n - 1));
    if (n < 32 && !(n === 16)) adj.push('#' + (n + 1));
    return adj;
  }

  // ── Multi-tooth calcAI ────────────────────────────────────
  function calcAIMulti(stateObj) {
    if (!stateObj.bone || !stateObj.hygiene || !stateObj.occlusion) return null;
    if (!stateObj.tooth2) return null;

    const t1 = stateObj.tooth;
    const t2 = stateObj.tooth2;
    if (!isAdjacent(t1, t2)) return null;

    const mx       = isMaxilla(t1);
    const post     = isPosteriorTooth(t1);
    const anterior = mx && !post;
    const abutComp = stateObj.abutmentQuality === 'Compromised';
    const youngGoodBone = stateObj.age < 35 && stateObj.bone === 'Good';

    // ── Base scores (2-tooth scenario) ─────────────────────
    // Option A: 2 Implants
    let implant2 = 94.0;
    // Option B: 4-Unit Bridge
    let bridge4  = 86.0;
    // Option C: Implant + Cantilever
    let cantilever = anterior ? 82.0 : 72.0; // anterior safer

    const reasons  = [];
    const factors  = [];

    // Bone
    const boneAdj = { Good: +0.8, Fair: -4.2, Poor: -12.5 };
    implant2   += boneAdj[stateObj.bone] * 2; // 2 implants affected
    bridge4    += stateObj.bone === 'Fair' ? 0.5 : stateObj.bone === 'Poor' ? -2.0 : 0;
    cantilever += boneAdj[stateObj.bone];

    // Hygiene
    if (stateObj.hygiene === 'Poor') {
      implant2   -= 11.5; bridge4 -= 4.5; cantilever -= 8.0;
      reasons.push('Poor hygiene: high peri-implantitis risk — maintenance protocol mandatory');
    } else if (stateObj.hygiene === 'Fair') {
      implant2   -= 2.6; bridge4 -= 1.5; cantilever -= 2.0;
    }

    // Abutment quality — critical for bridge and cantilever
    if (abutComp) {
      bridge4    -= 12.0;
      cantilever -= 10.0;
      implant2   += 5.0; // implants independent of abutments
      reasons.push('Compromised abutments: bridge and cantilever reliability significantly reduced — 2 implants strongly preferred');
      factors.push({ label: 'Compromised abutments → Implants ↑↑', type: 'neg', delta: -12 });
    }

    // Young patient + good bone → implants win long-term
    if (youngGoodBone) {
      implant2   += 4.0;
      reasons.push('Young patient with good bone: 2 implants offer superior 20+ year prognosis');
      factors.push({ label: 'Age <35 + Good bone +4.0%', type: 'pos', delta: +4.0 });
    }

    // Smoking
    if (stateObj.smoking === 'Current smoker') {
      implant2   -= 8.5; cantilever -= 6.0;
      bridge4    -= 2.0;
      reasons.push('Active smoker: implant failure rate up to 20% — smoking cessation required');
    } else if (stateObj.smoking === 'Former smoker') {
      implant2   -= 3.5; cantilever -= 2.5;
    }

    // Diabetes
    if (stateObj.diabetes === 'Uncontrolled') {
      implant2 -= 7.0; cantilever -= 5.0; bridge4 -= 2.0;
      reasons.push('Uncontrolled diabetes: 2–3× higher implant failure — glycemic control essential');
    } else if (stateObj.diabetes === 'Controlled') {
      implant2 -= 1.5; cantilever -= 1.0;
    }

    // Jaw + position
    if (mx && post) {
      implant2 -= 3.0;
      reasons.push('Maxilla posterior: lowest bone density — sinus proximity increases surgical complexity');
    } else if (!mx && post) {
      implant2 -= 0.5;
    }

    // Cantilever posterior warning
    if (post) {
      cantilever -= 8.0; // posterior cantilever high risk
      reasons.push('Posterior cantilever: high occlusal stress — significant fracture risk');
    }

    // Occlusion effect
    if (stateObj.occlusion === 'High occlusion load') {
      implant2   -= 1.8; bridge4 -= 0.8; cantilever -= 3.0;
    }

    // Age > 65
    if (stateObj.age > 65) { implant2 -= 2.5; cantilever -= 2.0; }

    // ── CLAMP ───────────────────────────────────────────────
    implant2   = Math.round(Math.max(50, Math.min(99, implant2))   * 10) / 10;
    bridge4    = Math.round(Math.max(50, Math.min(95, bridge4))    * 10) / 10;
    cantilever = Math.round(Math.max(40, Math.min(90, cantilever)) * 10) / 10;

    // ── 3-way recommendation ─────────────────────────────────
    const scores = [
      { option: 'implant2',   score: implant2   },
      { option: 'bridge4',    score: bridge4    },
      { option: 'cantilever', score: cantilever },
    ];
    scores.sort((a, b) => b.score - a.score);
    const ideal = scores[0].option;  // highest clinical score

    // ── Cost calculation (MUST be before usage) ─────────────
    // Wave C3: priority chain — patient override → clinic preference → catalog default.
    const costs = {
      implant2:   (stateObj.costImplant   != null ? stateObj.costImplant   : getClinicPrice('implant')) * 2
                  + (stateObj.bone === 'Poor' ? (stateObj.costBoneGraft != null ? stateObj.costBoneGraft : getClinicPrice('boneGraft')) * 2 : 0),
      bridge4:    stateObj.costBridge4 != null ? stateObj.costBridge4 : getClinicPrice('bridge4'),
      cantilever: Math.round((stateObj.costImplant != null ? stateObj.costImplant : getClinicPrice('implant')) * 1.5),  // 1 implant + extension
    };

    // Cost-adjusted recommendation:
    // In anterior, bridge is recommended for average patient (cost saving ~$4,500)
    // In posterior with compromised abutments, implants recommended regardless
    const costDiff = costs.implant2 - costs.bridge4;
    const bridgeIsReasonable = bridge4 >= 80 && !abutComp;
    let rec;
    if (bridgeIsReasonable && costDiff >= 3000) {
      // Bridge is practical recommendation, implants are ideal
      rec = 'bridge4';
    } else {
      rec = ideal;
    }

    // Confidence
    let conf = 70;
    if (stateObj.bone === 'Poor' || stateObj.hygiene === 'Poor') conf -= 10;
    if (abutComp) conf -= 8;
    if (youngGoodBone) conf += 5;
    // Parafunction — prosthetic durability under multi-tooth span load
    if (stateObj.parafunction === 'Bruxism' || stateObj.parafunction === 'Both') {
      conf -= 4;
      reasons.push('Bruxism: multi-tooth prosthetic fracture risk elevated — night guard mandatory');
    } else if (stateObj.parafunction === 'Clenching') {
      conf -= 2;
    }
    conf = Math.max(35, Math.min(90, conf));

    // Fallback reasons
    if (reasons.length < 2) {
      reasons.push('Two adjacent missing teeth: span length and abutment integrity are key factors');
      if (!abutComp) reasons.push('Healthy abutments support bridge as cost-effective alternative to 2 implants');
    }

    return {
      isMultiTooth: true,
      tooth1: t1, tooth2: t2,
      anterior, posterior: post,
      implant2, bridge4, cantilever,
      rec, ideal, conf,
      confLevel: conf >= 75 ? 'High' : conf >= 55 ? 'Medium' : 'Low',
      costs,
      abutmentCompromised: abutComp,
      reasons: reasons.slice(0, 4),
      factors,
      caseCount: conf >= 75 ? 'strong multi-tooth profile' : 'moderate — review carefully',
    };
  }

  function calcAI(stateObj) {
    if (!stateObj.bone || !stateObj.hygiene || !stateObj.occlusion) return null;
    const BASE_IMPLANT = 96.4, BASE_BRIDGE = 88.0;
    const FALLBACK_REASONS = [
      'Lower risk of abutment stress vs bridge',
      'Better long-term prognosis and durability',
      'Preserves adjacent tooth structure',
      'Higher patient satisfaction in studies'
    ];
    let implant = BASE_IMPLANT, bridge = BASE_BRIDGE, conf = 76;
    let peri = 'Low', boneR = 'Low', occR = 'Low';
    const reasons = [];
    const factors = [];

    switch (stateObj.bone) {
      case 'Good':
        implant += 0.8; conf += 2; boneR = 'Low';
        reasons.push('Native bone: 98.3% implant survival');
        factors.push({ label: 'Good bone', type: 'pos', delta: +0.8 });
        break;
      case 'Fair':
        implant -= 4.2; conf -= 10; boneR = 'Medium'; bridge += 0.5;
        reasons.push('Reduced bone volume — grafting may improve success');
        factors.push({ label: 'Fair bone −4.2%', type: 'warn', delta: -4.2 });
        break;
      default:
        implant -= 12.5; conf -= 22; boneR = 'High'; bridge -= 1.5;
        reasons.push('Poor bone (D3/D4): implant failure risk significantly elevated — grafting required');
        factors.push({ label: 'Poor bone −12.5%', type: 'neg', delta: -12.5 });
    }
    switch (stateObj.hygiene) {
      case 'Good':
        implant += 0.5; peri = 'Low';
        reasons.push('Good hygiene: peri‑implantitis risk < 10%');
        factors.push({ label: 'Good hygiene', type: 'pos', delta: +0.5 });
        break;
      case 'Fair':
        implant -= 2.6; bridge -= 1.5; peri = 'Medium'; conf -= 5;
        reasons.push('Moderate hygiene — peri‑implantitis risk ~22%');
        factors.push({ label: 'Fair hygiene −2.6%', type: 'warn', delta: -2.6 });
        break;
      default:
        implant -= 11.5; bridge -= 4.5; peri = 'High'; conf -= 18;
        reasons.push('Poor hygiene: peri‑implantitis prevalence up to 40% — patient counselling critical');
        factors.push({ label: 'Poor hygiene −11.5%', type: 'neg', delta: -11.5 });
    }
    // Smoking — major risk factor in implantology
    switch (stateObj.smoking || 'Non-smoker') {
      case 'Non-smoker':
        implant += 0.3;
        factors.push({ label: 'Non-smoker', type: 'pos', delta: +0.3 });
        break;
      case 'Former smoker':
        implant -= 3.5; conf -= 5;
        reasons.push('Former smoker: implant failure risk ~2× higher than non-smoker — monitor closely');
        factors.push({ label: 'Former smoker −3.5%', type: 'warn', delta: -3.5 });
        break;
      case 'Current smoker':
        implant -= 8.5; bridge -= 2.0; conf -= 12; peri = peri === 'Low' ? 'Medium' : 'High';
        reasons.push('Active smoker: implant failure rate up to 20% — smoking cessation strongly advised before surgery');
        factors.push({ label: 'Current smoker −8.5%', type: 'neg', delta: -8.5 });
        break;
    }
    // Diabetes — systemic risk factor
    let diabetesR = 'Low';
    switch (stateObj.diabetes || 'None') {
      case 'None':
        implant += 0.3;
        factors.push({ label: 'No diabetes +0.3%', type: 'pos', delta: +0.3 });
        diabetesR = 'Low';
        break;
      case 'Controlled':
        implant -= 1.5; conf -= 3; diabetesR = 'Medium';
        reasons.push('Controlled diabetes (HbA1c < 7.5%): slightly elevated implant failure risk — strict glycemic control required');
        factors.push({ label: 'Controlled DM −1.5%', type: 'warn', delta: -1.5 });
        bridge -= 0.5;
        break;
      case 'Uncontrolled':
        implant -= 7.0; conf -= 12; diabetesR = 'High';
        peri = 'High';
        boneR = boneR === 'Low' ? 'Medium' : 'High';
        reasons.push('Uncontrolled diabetes (HbA1c ≥ 7.5%): 2–3× higher implant failure risk — glycemic control is essential before any surgery');
        factors.push({ label: 'Uncontrolled DM −7.0%', type: 'neg', delta: -7.0 });
        bridge -= 2.0;
        break;
    }
    switch (stateObj.occlusion) {
      case 'Normal':
        implant += 0.4; occR = 'Low';
        reasons.push('Normal occlusion favors implant stability');
        factors.push({ label: 'Normal occlusion', type: 'pos', delta: +0.4 });
        break;
      case 'High occlusion load':
        implant -= 1.8; bridge -= 0.8; occR = 'Medium'; conf -= 3;
        reasons.push('High occlusal load — night guard advised');
        factors.push({ label: 'High occlusion −1.8%', type: 'warn', delta: -1.8 });
        break;
      default:
        occR = 'Low';
        reasons.push('Low occlusion minimizes restorative stress');
        factors.push({ label: 'Low occlusion', type: 'pos', delta: 0 });
    }
    // Parafunction — prosthetic durability and confidence realism for implant-borne restorations.
    // Score is intentionally unchanged: parafunction does not contraindicate implants, but does
    // increase prosthetic fracture risk and reduces recommendation certainty. Confidence-only.
    switch (stateObj.parafunction || 'None') {
      case 'Clenching':
        conf -= 2;
        factors.push({ label: 'Clenching − load caution', type: 'warn', delta: 0 });
        break;
      case 'Bruxism':
        conf -= 4;
        reasons.push('Bruxism: implant crown fracture risk elevated — monolithic zirconia prosthesis and night guard mandatory');
        factors.push({ label: 'Bruxism − confidence', type: 'warn', delta: 0 });
        break;
      case 'Both':
        conf -= 6;
        reasons.push('Bruxism + clenching: severe parafunctional forces — monolithic zirconia and strict night guard protocol required');
        factors.push({ label: 'Bruxism+Clenching − confidence', type: 'neg', delta: 0 });
        break;
    }
    // Jaw (Maxilla/Mandible) + Position — evidence-based registry data
    const _maxilla  = isMaxilla(stateObj.tooth);
    const _posterior= isPosteriorTooth(stateObj.tooth);
    if (_maxilla && _posterior) {
      implant -= 3.0; bridge -= 2.2; conf -= 2;
      reasons.push('Upper posterior (Maxilla): lowest bone density zone, sinus proximity — highest implant complication site');
      factors.push({ label: 'Maxilla posterior −3.0%', type: 'warn', delta: -3.0 });
    } else if (_maxilla && !_posterior) {
      implant -= 1.5; bridge += 0.5;
      reasons.push('Upper anterior (Maxilla): adequate for implant — esthetic zone, bone density slightly lower than mandible');
      factors.push({ label: 'Maxilla anterior −1.5%', type: 'warn', delta: -1.5 });
    } else if (!_maxilla && _posterior) {
      implant -= 0.5; bridge -= 2.2;
      reasons.push('Lower posterior (Mandible): excellent bone density — favorable implant zone with predictable outcomes');
      factors.push({ label: 'Mandible posterior −0.5%', type: 'neu', delta: -0.5 });
    } else {
      implant += 0.5; bridge += 0.5;
      reasons.push('Lower anterior (Mandible): best bone density and implant accessibility — most predictable zone');
      factors.push({ label: 'Mandible anterior +0.5%', type: 'pos', delta: +0.5 });
    }
    if (stateObj.age < 40) {
      implant += 0.6; bridge += 0.3; conf += 1;
      reasons.push('Age < 40: implant osseointegration and long-term value are optimal');
      factors.push({ label: 'Age < 40 +0.6%', type: 'pos', delta: +0.6 });
    } else if (stateObj.age > 65) {
      implant -= 2.5; bridge -= 1.8; conf -= 4;
      reasons.push('Age > 65: healing time and bone density may reduce implant success');
      factors.push({ label: `Age ${stateObj.age} −2.5%`, type: 'warn', delta: -2.5 });
    }
    // Skeletal immaturity — jaw growth typically completes at 18–20 yrs.
    // Implant placed before growth arrest will be ankylosed and infraoccluded
    // as adjacent teeth continue to erupt. Deferral is the clinical standard.
    if (stateObj.age < 18) {
      implant -= 15.0; conf -= 15;
      reasons.push('Age < 18: skeletal growth likely incomplete — implant strongly deferred until jaw maturity confirmed (cephalometric assessment recommended)');
      factors.push({ label: 'Age <18 — growth risk −15.0%', type: 'neg', delta: -15.0 });
    }
    if (['Severe decay','Failed restoration'].includes(stateObj.condition)) {
      implant -= 1.5; bridge -= 1.2;
      reasons.push('Adjacent tooth damage may affect restorative prognosis');
      factors.push({ label: 'Compromised tooth', type: 'neg', delta: -1.5 });
    }

    // Fix 1: Bridge Logic — warn when Poor bone makes bridge risky for adjacent teeth
    let bridgeWarning = null;
    if (stateObj.bone === 'Poor' && stateObj.tx === 'bridge') {
      bridgeWarning = 'Poor bone quality may compromise abutment teeth — bridge could accelerate adjacent tooth loss';
      if (!reasons.includes(bridgeWarning)) reasons.push(bridgeWarning);
    }

    // ── CROWN VIABILITY + SCORING ───────────────────────────────
    const BASE_CROWN = 91.0;
    let crown = BASE_CROWN;
    let crownViable = false;
    let crownWarning = null;

    switch (stateObj.condition) {
      case 'Missing tooth':
        crownViable = false;
        crownWarning = 'Crown not applicable: no tooth structure remains. Consider implant or bridge.';
        crown = 0;
        break;
      case 'Fractured tooth':
        crownViable = true;
        if (stateObj.remainingStructure === 'Poor') {
          crownWarning = 'Poor remaining structure — high root fracture risk (60% failure). Consider extraction + implant.';
          crown = 0; crownViable = false;
        } else if (stateObj.remainingStructure === 'Fair') {
          crownWarning = 'Partial ferrule — viable with post & core support, monitor closely.';
        }
        break;
      case 'Severe decay':
        crownViable = (stateObj.remainingStructure !== 'Poor');
        if (!crownViable) {
          crownWarning = 'Severe decay with poor structure: extraction + implant strongly recommended.';
          crown = 0;
        } else {
          crownWarning = 'Crown viable ONLY if root is salvageable — verify radiographic bone support.';
        }
        break;
      case 'Failed restoration':
        crownViable = true;
        reasons.push('Failed restoration: crown replaces compromised restoration while preserving natural tooth structure');
        factors.push({ label: 'Replace failed restoration +1.0%', type: 'pos', delta: +1.0 });
        crown += 1.0;
        break;
    }

    if (crownViable && crown > 0) {
      // Remaining Structure (Ferrule Effect)
      switch (stateObj.remainingStructure || 'Good') {
        case 'Good':
          crown += 3.5; conf += 2;
          reasons.push('Good remaining structure (≥2mm ferrule): excellent fracture resistance');
          factors.push({ label: 'Good structure +3.5%', type: 'pos', delta: +3.5 });
          break;
        case 'Fair':
          crown += 0.5;
          reasons.push('Fair structure: crown viable with post & core support');
          factors.push({ label: 'Fair structure +0.5%', type: 'warn', delta: +0.5 });
          break;
        case 'Poor':
          crown = 0; crownViable = false;
          crownWarning = 'Poor structure makes crown non-viable — no ferrule possible';
          break;
      }
      if (crownViable && crown > 0) {
        // Endodontic Status
        switch (stateObj.endodonticStatus || 'No RCT needed') {
          case 'RCT done':
            crown += 1.5;
            reasons.push('RCT completed: endodontic failure risk eliminated, 91.3% survival at 10 years');
            factors.push({ label: 'RCT done +1.5%', type: 'pos', delta: +1.5 });
            break;
          case 'No RCT needed':
            crown += 2.5;
            reasons.push('Vital pulp: no endodontic intervention required — optimal prognosis');
            factors.push({ label: 'Vital pulp +2.5%', type: 'pos', delta: +2.5 });
            break;
          case 'Needs RCT':
            crown -= 3.0; conf -= 7;
            reasons.push('RCT needed before crown: adds cost ($1,000), treatment time (2-4 weeks), and procedural risk');
            factors.push({ label: 'Needs RCT −3.0%', type: 'neg', delta: -3.0 });
            break;
        }
        // Parafunction
        switch (stateObj.parafunction || 'None') {
          case 'None':
            crown += 0.5;
            factors.push({ label: 'No parafunction +0.5%', type: 'pos', delta: +0.5 });
            break;
          case 'Clenching':
            crown -= 2.0;
            reasons.push('Clenching: increases crown and root fracture risk — night guard essential');
            factors.push({ label: 'Clenching −2.0%', type: 'warn', delta: -2.0 });
            break;
          case 'Bruxism':
            crown -= 4.0; conf -= 5;
            reasons.push('Bruxism: 60% failure rate vs 10% without — immediate night guard required');
            factors.push({ label: 'Bruxism −4.0%', type: 'neg', delta: -4.0 });
            break;
          case 'Both':
            crown -= 5.0; conf -= 7;
            reasons.push('Bruxism + Clenching: extremely high fracture risk — consider implant instead');
            factors.push({ label: 'Bruxism+Clenching −5.0%', type: 'neg', delta: -5.0 });
            break;
        }
        // Occlusion (Crown-specific)
        switch (stateObj.occlusion) {
          case 'High occlusion load':
            crown -= 2.5;
            reasons.push('High occlusion: increased crown fracture and wear risk — night guard essential');
            factors.push({ label: 'High occlusion −2.5%', type: 'warn', delta: -2.5 });
            break;
          case 'Normal':
            crown += 0.5;
            factors.push({ label: 'Normal occlusion +0.5%', type: 'pos', delta: +0.5 });
            break;
          case 'Low':
            crown += 1.5;
            reasons.push('Low occlusion: minimal wear risk, excellent crown longevity');
            factors.push({ label: 'Low occlusion +1.5%', type: 'pos', delta: +1.5 });
            break;
        }
        // Smoking (less impact on crown than implant)
        switch (stateObj.smoking || 'Non-smoker') {
          case 'Non-smoker':  crown += 0.5; factors.push({ label: 'Non-smoker +0.5%', type: 'pos', delta: +0.5 }); break;
          case 'Former smoker': crown -= 0.5; factors.push({ label: 'Former smoker −0.5%', type: 'warn', delta: -0.5 }); break;
          case 'Current smoker':
            crown -= 1.0;
            reasons.push('Active smoking: increases periodontal risk around crowned tooth');
            factors.push({ label: 'Current smoker −1.0%', type: 'neg', delta: -1.0 });
            break;
        }
        // Diabetes (affects periodontal support and healing)
        switch (stateObj.diabetes || 'None') {
          case 'Controlled':
            crown -= 0.5;
            factors.push({ label: 'Controlled DM −0.5%', type: 'warn', delta: -0.5 });
            break;
          case 'Uncontrolled':
            crown -= 1.5;
            reasons.push('Uncontrolled diabetes: impaired healing and increased secondary caries/periodontal risk');
            factors.push({ label: 'Uncontrolled DM −1.5%', type: 'neg', delta: -1.5 });
            break;
        }
        // Hygiene — crown margin secondary caries risk
        switch (stateObj.hygiene || 'Good') {
          case 'Poor':
            crown -= 3.5; conf -= 3;
            reasons.push('Poor hygiene: secondary caries at crown margins — intensive maintenance mandatory');
            factors.push({ label: 'Poor hygiene −3.5%', type: 'neg', delta: -3.5 });
            break;
          case 'Fair':
            crown -= 1.0;
            factors.push({ label: 'Fair hygiene −1.0%', type: 'warn', delta: -1.0 });
            break;
        }
        // Tooth position
        if (isPosteriorTooth(stateObj.tooth)) {
          crown -= 1.0;
          factors.push({ label: 'Posterior −1.0%', type: 'warn', delta: -1.0 });
        } else {
          crown += 0.5;
          factors.push({ label: 'Anterior +0.5%', type: 'pos', delta: +0.5 });
        }
        // Jaw (maxilla has lower bone support for crown retention)
        if (_maxilla) {
          crown -= 0.5;
          factors.push({ label: 'Maxilla −0.5%', type: 'warn', delta: -0.5 });
        }
        // Age
        if (stateObj.age < 30) {
          crown += 0.5;
          factors.push({ label: 'Age < 30 +0.5%', type: 'pos', delta: +0.5 });
        } else if (stateObj.age > 65) {
          crown -= 1.0;
          reasons.push('Age > 65: reduced periodontal support may compromise crown longevity');
          factors.push({ label: `Age ${stateObj.age} −1.0%`, type: 'warn', delta: -1.0 });
        }
      }
    }

    // ── FINAL SCORING: clamp all scores ──────────────────────────
    implant = Math.round(Math.max(50, Math.min(99, implant)) * 10) / 10;
    bridge  = Math.round(Math.max(50, Math.min(95, bridge))  * 10) / 10;
    if (crownViable && crown > 0) {
      crown = Math.round(Math.max(60, Math.min(97, crown)) * 10) / 10;
    } else { crown = 0; }
    conf = Math.max(35, Math.min(95, Math.round(conf)));

    // 3-way recommendation — pick HIGHEST evidence-based score among viable options
    let recScores = [{ option: 'implant', score: implant }, { option: 'bridge', score: bridge }];
    if (crownViable && crown > 0) recScores.push({ option: 'crown', score: crown });
    recScores.sort((a, b) => b.score - a.score);
    const rec = recScores[0].option; // Truly best option based on clinical data
    const confLevel = conf >= 75 ? 'High' : conf >= 55 ? 'Medium' : 'Low';

    const usedReasons = new Set(reasons);
    for (const r of FALLBACK_REASONS) {
      if (reasons.length >= 4) break;
      if (!usedReasons.has(r)) { reasons.push(r); usedReasons.add(r); }
    }

    const caseCount = conf >= 80 ? 'strong clinical profile' : conf >= 60 ? 'moderate clinical profile' : 'limited data — review carefully';
    const smokingStatus2 = stateObj.smoking || 'Non-smoker';
    const smokingR = smokingStatus2 === 'Current smoker' ? 'High' : smokingStatus2 === 'Former smoker' ? 'Medium' : 'Low';
    // diabetesR already set in diabetes switch above

    // Crown risks
    const crownRisks = (crownViable && crown > 0) ? {
      secondaryCaries: stateObj.hygiene === 'Poor' ? 'High' : stateObj.hygiene === 'Fair' ? 'Medium' : 'Low',
      crownFracture: (stateObj.parafunction === 'Bruxism' || stateObj.parafunction === 'Both')
                       ? 'High'
                       : (stateObj.occlusion === 'High occlusion load' || stateObj.parafunction === 'Clenching')
                         ? 'Medium'
                         : 'Low',
      rootFracture: (stateObj.remainingStructure || 'Good') === 'Poor' ? 'High' : (stateObj.remainingStructure || 'Good') === 'Fair' ? 'Medium' : 'Low',
      endodonticFailure: (stateObj.endodonticStatus || 'No RCT needed') === 'Needs RCT' ? 'High' : (stateObj.endodonticStatus || 'No RCT needed') === 'RCT done' ? 'Low' : 'Medium',
      parafunctionDamage: stateObj.parafunction === 'Both' ? 'Critical' : stateObj.parafunction === 'Bruxism' ? 'High' : stateObj.parafunction === 'Clenching' ? 'Medium' : 'Low'  // EC#3
    } : null;

    return { implant, bridge, crown, conf, confLevel, rec, peri, boneR, occR, smokingR, diabetesR, crownViable, crownWarning, crownRisks, reasons: reasons.slice(0, 5), factors, caseCount };
  }
