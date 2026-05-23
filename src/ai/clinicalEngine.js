  const ClinicalEngine = (() => {
    'use strict';

    // ── CASE TYPE CONSTANTS ────────────────────────────────────────
    const CT = Object.freeze({
      MISSING_SINGLE:          'MISSING_SINGLE',
      MISSING_MULTI:           'MISSING_MULTI',
      RESTORATIVE_VIABLE:      'RESTORATIVE_VIABLE',
      RESTORATIVE_COMPROMISED: 'RESTORATIVE_COMPROMISED',
      RESTORATIVE_HOPELESS:    'RESTORATIVE_HOPELESS',
    });

    // ── STAGE 1: CASE NORMALIZER ───────────────────────────────────
    // Produces a structured clinical model from raw state.
    // Single source of truth consumed by all downstream stages.
    function normalize(s) {
      const posterior = isPosteriorTooth(s.tooth);
      const maxilla   = isMaxilla(s.tooth);
      const rs  = s.remainingStructure || 'Good';
      const es  = s.endodonticStatus   || 'No RCT needed';
      const pf  = s.parafunction       || 'None';
      return {
        tooth: { id: s.tooth, isMaxilla: maxilla, isPosterior: posterior,
                 isAnterior: !posterior, isMandibular: !maxilla },
        restorative: {
          condition: s.condition, remainingStructure: rs,
          endoStatus: es, isMissing: s.condition === 'Missing tooth',
          hasFracture: s.condition === 'Fractured tooth',
          hasDecay: s.condition === 'Severe decay',
          hasFailedResto: s.condition === 'Failed restoration',
          needsRCT: es === 'Needs RCT', rctDone: es === 'RCT done',
          goodStructure: rs === 'Good', fairStructure: rs === 'Fair', poorStructure: rs === 'Poor',
        },
        periodontal: {
          bone: s.bone, hygiene: s.hygiene,
          goodBone: s.bone === 'Good', fairBone: s.bone === 'Fair', poorBone: s.bone === 'Poor',
          goodHygiene: s.hygiene === 'Good', poorHygiene: s.hygiene === 'Poor',
        },
        occlusal: {
          load: s.occlusion, highLoad: s.occlusion === 'High occlusion load',
          parafunction: pf,
          bruxism: pf === 'Bruxism' || pf === 'Both',
          clenching: pf === 'Clenching' || pf === 'Both',
        },
        systemic: {
          smoking: s.smoking || 'Non-smoker',
          diabetes: s.diabetes || 'None',
          currentSmoker: s.smoking === 'Current smoker',
          uncontrolledDM: s.diabetes === 'Uncontrolled',
        },
        biomechanical: {
          ferrule: rs, goodFerrule: rs === 'Good', poorFerrule: rs === 'Poor',
          abutmentQuality: s.abutmentQuality || 'Good',
          abutmentCompromised: s.abutmentQuality === 'Compromised',
        },
        patient: { age: s.age, young: s.age < 40, elderly: s.age > 65 },
        multi: { active: !!(s.multiTooth && s.tooth2 && s.condition === 'Missing tooth'), tooth2: s.tooth2 },
        // Wave C3: priority chain — patient override → clinic preference → catalog default.
        // implant added here so buildRestorativeResult() can use it for extract_impl cost.
        costs: {
          implant:  s.costImplant   || getClinicPrice('implant'),
          crown:    s.costCrown     || getClinicPrice('crown'),
          rct:      s.costRCT       || getClinicPrice('rct'),
          postCore: s.costPostCore  || getClinicPrice('postCore'),
          overlay:  s.costOverlay   || getClinicPrice('overlay'),  // R2.1: clinic-configurable onlay price
        },
      };
    }

    // ── STAGE 2: CASE CLASSIFIER ──────────────────────────────────
    // Determines case category — single source of truth for downstream logic.
    function classify(c) {
      const { restorative: r, periodontal: p, occlusal: o, multi: m } = c;
      if (r.isMissing) {
        if (m.active) return { type: CT.MISSING_MULTI, label: 'Two Adjacent Missing Teeth' };
        return { type: CT.MISSING_SINGLE, label: 'Single Missing Tooth' };
      }
      // Hopeless: structurally non-restorable
      if (r.poorStructure && (p.poorBone || o.bruxism || r.needsRCT)) {
        return { type: CT.RESTORATIVE_HOPELESS, label: 'Tooth with Poor Prognosis',
                 notes: 'Extraction and replacement strongly recommended' };
      }
      // Compromised: guarded prognosis
      if (r.poorStructure || (r.fairStructure && (o.bruxism || p.poorBone))) {
        return { type: CT.RESTORATIVE_COMPROMISED, label: 'Structurally Compromised Tooth',
                 notes: 'Guarded prognosis — restorative possible with risk awareness' };
      }
      return { type: CT.RESTORATIVE_VIABLE, label: 'Restorable Tooth',
               notes: r.goodStructure ? 'Excellent prognosis' : 'Good prognosis with appropriate treatment' };
    }

    // ── STAGE 3: VALID TREATMENT UNIVERSE GENERATOR ───────────────
    // Generates only clinically valid treatment options for the case.
    // Each option maps to a card slot (implant/bridge/crown) so the
    // existing S.tx, renderTxCards, and comparison infrastructure works.
    function generateTreatments(caseClass, c) {
      const { restorative: r, occlusal: o, tooth: t, biomechanical: b } = c;

      // Onlay viable: Good structure, vital (or no RCT needed), no decay, no bruxism
      const onlayViable = b.goodFerrule && !r.needsRCT && !r.rctDone &&
                          !r.hasDecay && !o.bruxism && r.goodStructure;
      // Endocrown viable: RCT done, posterior only
      const endocrownViable = r.rctDone && t.isPosterior;
      // Splinting is a MULTI-TOOTH procedure that links adjacent crowns to share load.
      // Indications (clinical literature):
      //   - Poor ferrule on a POSTERIOR tooth (borrows retention from neighbors for
      //     lateral force distribution — a posterior biomechanical strategy only)
      //   - Compromised adjacent abutment quality (universal indication: borrows
      //     retention regardless of position)
      // NOT triggered by case classification alone — bruxism-only COMPROMISED cases
      // receive monolithic zirconia + nightguard, not splinting overtreatment (H3 fix).
      // NOT triggered by anterior poor ferrule alone — anterior poor ferrule → crown_core
      // + escalation assessment, not splinting (D-H1 fix: anterior splinting for
      // ferrule loss only is specialist eye-roll territory; Wave D 2026-05-21).
      const splintedPreferred = (b.poorFerrule && t.isPosterior) || b.abutmentCompromised;
      // Escalation to extraction viable when: hopeless or compromised
      const escalationViable = caseClass.type === CT.RESTORATIVE_HOPELESS ||
                               caseClass.type === CT.RESTORATIVE_COMPROMISED;

      return [
        // SLOT 1 ('implant' S.tx key) — minimal / conservative option
        // Endocrown promoted to slot1: it IS the most conservative full-coverage
        // option for RCT-done posterior teeth (no post, pulp chamber macroretention).
        // Guard: suppress in HOPELESS — escalation is the clinical imperative there.
        onlayViable
          ? { slot: 'implant', id: 'onlay',      label: 'Onlay / Overlay',     sub: 'Minimal Prep · Conservative' }
          : (endocrownViable && caseClass.type !== CT.RESTORATIVE_HOPELESS)
          ? { slot: 'implant', id: 'endocrown',  label: 'Endocrown',           sub: 'Monolithic · No Post' }
          : { slot: 'implant', id: 'crown_core', label: 'Crown + Core',        sub: 'Post & Core Build-up' },

        // SLOT 2 ('bridge' S.tx key) — standard crown option
        splintedPreferred
          ? { slot: 'bridge', id: 'splinted',    label: 'Splinted Crowns',     sub: 'Load Distribution' }
          : { slot: 'bridge', id: 'crown',       label: 'Crown',               sub: 'Standard Coverage' },

        // SLOT 3 ('crown' S.tx key) — escalation / advanced option
        // Escalation always takes slot3 when viable — COMPROMISED cases must surface
        // extract_impl even when endocrown is an option (C1 fix). Endocrown is in slot1.
        escalationViable
          ? { slot: 'crown', id: 'extract_impl', label: 'Extract + Implant',   sub: 'Escalation Path' }
          : { slot: 'crown', id: 'crown_adv',   label: 'Crown + Core',        sub: 'Full Coverage' },
      ];
    }

    // ── STAGE 4: CLINICAL SCORING ENGINE ──────────────────────────
    // Scores each treatment using clinical evidence and patient factors.
    // Crown/implant base scores from calcAI for accuracy consistency.
    function scoreRestorative(treatments, c, baseAI, caseClass) {
      const { restorative: r, occlusal: o, tooth: t, biomechanical: b,
              periodontal: p, systemic: sys } = c;

      return treatments.map(tx => {
        let score = 0;
        const rationale = [];

        switch (tx.id) {
          case 'onlay': {
            score = 91.0;
            if (b.goodFerrule)     { score += 3.0; rationale.push('Excellent residual structure — onlay preparation maximally preserves natural tooth'); }
            if (!o.highLoad)       { score += 1.5; rationale.push('Low occlusal load favors minimal preparation approach'); }
            if (t.isPosterior)     { score += 1.0; rationale.push('Posterior position ideal for onlay biomechanical distribution'); }
            if (!r.needsRCT)       { score += 2.0; rationale.push('Vital pulp: no endodontic risk — highest preservation prognosis'); }
            if (p.goodBone)        { score += 0.5; rationale.push('Good periodontal support ensures stable long-term margin integrity'); }
            if (o.bruxism)         { score -= 8.0; rationale.push('⚠ Bruxism: onlay margins at high fracture risk — full coverage crown preferred'); }
            if (o.highLoad)        { score -= 4.0; rationale.push('High occlusal load risks marginal fracture at onlay preparation boundary'); }
            if (sys.currentSmoker) { score -= 2.0; rationale.push('Smoking increases secondary caries risk at resin margins'); }
            if (p.poorHygiene)     { score -= 6.0; rationale.push('Poor hygiene: resin bond degrades under bacterial acid — crown preferred for margin integrity'); }
            if (r.hasDecay)        { score -= 5.0; rationale.push('Active decay compromises bond quality — full coverage preferred'); }
            break;
          }
          case 'crown': case 'crown_core': case 'crown_adv': {
            score = baseAI.crown > 0 ? baseAI.crown : 87.0;
            rationale.push(tx.id === 'crown_core'
              ? 'Post & core build-up required — adds structural risk but restores functional crown'
              : 'Standard crown preparation with adequate ferrule support');
            if (b.goodFerrule)  rationale.push('Good ferrule (≥2mm): optimal fracture resistance predicted');
            if (r.rctDone)      rationale.push('RCT completed: endodontic stability confirmed before crown');
            if (o.bruxism)      rationale.push('⚠ Bruxism: monolithic zirconia required — occlusal night guard essential');
            if (p.poorHygiene)  rationale.push('Poor hygiene: secondary caries at crown margins — strict maintenance protocol required');
            if (tx.id === 'crown_core' && r.fairStructure) { score -= 1.5; }
            break;
          }
          case 'splinted': {
            score = Math.max(72, (baseAI.crown > 0 ? baseAI.crown : 85.0) - 1.5);
            if (o.highLoad)      { score += 4.0; rationale.push('High occlusal load: splinting distributes lateral forces — reduces individual crown fracture risk ~40%'); }
            if (o.bruxism)       { score += 3.0; rationale.push('Bruxism: splinted crowns reduce lateral force concentration via shared occlusal surface'); }
            if (b.poorFerrule)   { score += 2.5; rationale.push('Compromised ferrule: mutual support via splinting improves retention and load resistance'); }
            if (p.poorHygiene)   { score -= 5.0; rationale.push('Poor hygiene: splinted crowns create plaque-retentive embrasures — periodontitis risk elevated'); }
            if (!o.highLoad && !o.bruxism && !b.poorFerrule) {
              score -= 3.0;
              rationale.push('No clinical indication for splinting — separate crowns preferred for hygiene access and retrievability');
            }
            break;
          }
          case 'endocrown': {
            score = 89.0;
            if (r.rctDone)      { score += 3.0; rationale.push('RCT completed: endocrown is evidence-based first choice for posterior endodontically treated teeth (96% retention at 5 yrs)'); }
            if (t.isPosterior)  { score += 2.0; rationale.push('Posterior position: pulp chamber macroretention distributes masticatory forces optimally'); }
            if (!o.bruxism)     { score += 1.5; rationale.push('No bruxism: endocrown fracture risk within normal range (92–94% survival at 5 years)'); }
            if (o.bruxism)      { score -= 6.0; rationale.push('⚠ Bruxism: endocrown fracture risk elevated — monolithic zirconia or additional coverage recommended'); }
            if (o.highLoad)     { score -= 2.5; rationale.push('High occlusal load: monitor carefully — ensure adequate occlusal coverage thickness ≥2mm'); }
            if (b.poorFerrule)  { score += 1.0; rationale.push('Compromised ferrule: endocrown avoids post stress — macroretention superior to conventional post'); }
            if (p.poorHygiene)  { score -= 1.5; rationale.push('Poor hygiene: marginal integrity monitoring essential to prevent secondary failure'); }
            if (t.isMaxilla)    { score -= 3.5; rationale.push('Maxillary position: less predictable chamber depth — endocrown retention 5–10% lower than mandibular molars (literature consensus)'); }
            break;
          }
          case 'extract_impl': {
            score = baseAI.implant;
            rationale.push('Tooth prognosis is guarded — extraction eliminates ongoing infection or fracture propagation risk');
            rationale.push('Implant placement after healing: predictable outcome vs attempting to preserve compromised tooth');
            if (p.poorBone)         { score -= 5.0; rationale.push('Poor bone: bone grafting required — extends treatment timeline 4–6 months'); }
            if (sys.currentSmoker)  { score -= 4.0; rationale.push('Active smoker: extraction site healing and osseointegration significantly compromised'); }
            if (sys.uncontrolledDM) { score -= 3.0; rationale.push('Uncontrolled diabetes: impaired healing increases extraction and implant failure risk'); }
            // CLINICAL SAFETY FLOOR: in HOPELESS cases, extract must remain the
            // primary recommendation. Systemic penalties reduce confidence (and
            // are documented in rationale) but the score itself must not drop
            // below 70 — leaving a non-restorable tooth in place is worse than
            // a delayed/staged extract+implant pathway, regardless of risk factors.
            if (caseClass?.type === CT.RESTORATIVE_HOPELESS) {
              score = Math.max(score, 70);
              if (score === 70) rationale.push('Hopeless tooth: extraction remains clinically preferred despite elevated systemic risk — defer implant timing if needed');
            }
            break;
          }
          default: score = 80.0;
        }

        // Per-option clinical ceiling — prevents score saturation that destroys
        // ranking discrimination. Each ceiling reflects evidence-based maximum
        // long-term survival rates for that specific procedure type.
        const PER_OPTION_CEILING = {
          onlay:        95,  // marginal failure risk caps long-term success
          crown:        96,  // standard literature ceiling
          crown_core:   94,  // post adds structural risk
          crown_adv:    96,
          splinted:     93,  // hygiene access + retrievability cap
          endocrown:    94,  // 5-year survival data ceiling (Sedrez-Porto 2016)
          extract_impl: 97,  // highest survival in best conditions
        };
        // HOPELESS prognosis penalty: when the case is classified non-restorable,
        // preservation attempts carry intrinsic prognosis risk regardless of how
        // each individual factor scores. Apply a flat clinical-reality penalty
        // to ensure extract ranks above preservation in hopeless classifications.
        const isPreservation = tx.id !== 'extract_impl';
        if (isPreservation && caseClass?.type === CT.RESTORATIVE_HOPELESS) {
          score -= 18;
          rationale.push('⚠ Hopeless prognosis: tooth classified non-restorable — preservation attempts carry high failure risk regardless of individual treatment factors');
        }
        const optionCeiling = PER_OPTION_CEILING[tx.id] || 96;
        score = Math.round(Math.max(50, Math.min(optionCeiling, score)) * 10) / 10;
        return { ...tx, score, rationale };
      });
    }

    // ── STAGE 5: RECOMMENDATION ENGINE ────────────────────────────
    // Determines the best treatment considering clinical scores + case classification.
    function recommend(scored, baseAI, caseClass) {
      if (!scored || !scored.length) return { rec: 'bridge', ideal: 'bridge', conf: baseAI.conf, confLevel: baseAI.confLevel };
      const sorted = [...scored].sort((a, b) => b.score - a.score);
      const ideal = sorted[0].slot;
      // Tooth-preservation bias applies ONLY when classification is COMPROMISED or VIABLE.
      // HOPELESS cases must defer to extract — preservation bias here would override
      // a clinically determined non-restorable diagnosis, which is unsafe.
      const extractOpt = scored.find(t => t.id === 'extract_impl');
      const bestPreserve = sorted.find(t => t.id !== 'extract_impl');
      const allowPreservationBias = caseClass?.type !== CT.RESTORATIVE_HOPELESS;
      const biasFires = allowPreservationBias && extractOpt && bestPreserve &&
                        bestPreserve.score >= extractOpt.score - 3;
      const rec = biasFires ? bestPreserve.slot : ideal;
      let conf = Math.max(35, Math.min(92, baseAI.conf));
      // Preservation-tension softening: when preservation bias fires but extraction
      // scored higher, the recommendation is a close clinical call — soften confidence
      // proportionally to how competitive extraction was. The closer extract was to
      // winning, the more genuine uncertainty exists about the preservation decision.
      if (biasFires && extractOpt.score > bestPreserve.score) {
        const pressureGap = extractOpt.score - bestPreserve.score;
        if (pressureGap >= 2)        conf = Math.max(35, conf - 7);
        else if (pressureGap >= 0.5) conf = Math.max(35, conf - 4);
        else                         conf = Math.max(35, conf - 2);
      }
      return { rec, ideal, conf, confLevel: conf >= 75 ? 'High' : conf >= 55 ? 'Medium' : 'Low' };
    }

    // ── STAGE 6: EXPLAINABILITY ENGINE ────────────────────────────
    // Structured clinical reasoning synchronized with scoring engine.
    // Explanations derive from actual scores — never contradict recommendations.
    function explain(scored, recResult, caseClass, c) {
      const recOpt = scored.find(t => t.slot === recResult.rec) || scored[0];
      const others = scored.filter(t => t.slot !== recResult.rec).sort((a, b) => b.score - a.score);
      const { biomechanical: b, occlusal: o, periodontal: p, restorative: r, systemic: sys } = c;

      const reasons = [
        `Case classified: ${caseClass.label}${caseClass.notes ? ' — ' + caseClass.notes : ''}`,
        ...(recOpt?.rationale?.slice(0, 3) || []),
      ];
      // Why alternatives ranked lower (only when gap is meaningful)
      for (const alt of others.slice(0, 2)) {
        const diff = (recOpt?.score || 0) - alt.score;
        if (diff > 3) reasons.push(`${alt.label} scored lower (Δ${diff.toFixed(1)}%): ${alt.rationale[0] || '—'}`);
      }
      const factors = [];
      if (b.goodFerrule)  factors.push({ label: 'Good ferrule ≥2mm', type: 'pos', delta: +3.5 });
      if (b.poorFerrule)  factors.push({ label: 'Poor ferrule <1mm', type: 'neg', delta: -5.0 });
      if (o.bruxism)      factors.push({ label: 'Bruxism — fracture risk', type: 'neg', delta: -4.0 });
      if (o.highLoad)     factors.push({ label: 'High occlusal load', type: 'warn', delta: -2.5 });
      if (p.poorBone)     factors.push({ label: 'Poor bone quality', type: 'neg', delta: -3.0 });
      if (r.rctDone)      factors.push({ label: 'RCT done — stable', type: 'pos', delta: +1.5 });
      if (r.needsRCT)     factors.push({ label: 'RCT needed', type: 'warn', delta: -3.0 });
      if (p.poorHygiene)  factors.push({ label: 'Poor hygiene — caries risk', type: 'neg', delta: -2.5 });
      if (sys.currentSmoker)         factors.push({ label: 'Active smoker — healing risk', type: 'neg', delta: -2.0 });
      if (sys.uncontrolledDM)        factors.push({ label: 'Uncontrolled DM — healing risk', type: 'neg', delta: -3.0 });
      if (o.clenching && !o.bruxism) factors.push({ label: 'Clenching — load risk', type: 'warn', delta: -1.5 });

      return {
        summary: `${recOpt?.label || 'Crown'} recommended — ${recResult.confLevel} clinical confidence`,
        reasons: reasons.slice(0, 5),
        factors: factors.slice(0, 6),
        recOption: recOpt,
      };
    }

    // ── RESULT BUILDER ─────────────────────────────────────────────
    // Builds a fully backward-compatible ai object so every existing
    // render function (renderComparison, renderRisk, renderCost, renderGraph,
    // updateAICard, etc.) continues to work without modification paths.
    function buildRestorativeResult(scored, recResult, expl, caseClass, c, baseAI, treatments) {
      const bySlot = {};
      scored.forEach(t => { bySlot[t.slot] = t; });
      // Slot scores map to backward-compat fields implant/bridge/crown
      const implant = bySlot['implant']?.score ?? baseAI.implant;
      const bridge  = bySlot['bridge']?.score  ?? baseAI.bridge;
      const crown   = bySlot['crown']?.score   ?? (baseAI.crownViable ? baseAI.crown : 80.0);

      // Per-slot display labels for card relabeling and report generation
      const restorativeLabels = {
        slot1: bySlot['implant'] || { label: 'Crown + Core', sub: 'Full Coverage' },
        slot2: bySlot['bridge']  || { label: 'Crown',        sub: 'Standard Coverage' },
        slot3: bySlot['crown']   || { label: 'Crown',        sub: 'Full Coverage' },
      };
      // Human-readable label for the recommended option (used in AI card typewriter)
      const SLOT_MAP = { implant: 'slot1', bridge: 'slot2', crown: 'slot3' };
      const recDisplay = restorativeLabels[SLOT_MAP[recResult.rec]]?.label || 'Crown';

      return {
        // ── Backward-compatible fields ─────────────────────────────
        implant, bridge, crown,
        conf: recResult.conf, confLevel: recResult.confLevel,
        rec: recResult.rec,
        peri: baseAI.peri, boneR: baseAI.boneR, occR: baseAI.occR,
        smokingR: baseAI.smokingR, diabetesR: baseAI.diabetesR,
        crownViable: true,   // all slots are clinically relevant in restorative mode
        crownWarning: baseAI.crownWarning,
        crownRisks: baseAI.crownRisks,
        reasons: expl.reasons,
        factors: expl.factors,
        caseCount: baseAI.caseCount,
        bridgeWarning: null,
        // ── New structured fields ──────────────────────────────────
        treatmentMode: 'restorative',
        caseClass,
        clinical: c,
        treatments,
        scored,
        explanation: expl,
        restorativeLabels,
        recDisplay,           // correct display name for the rec (not "Implant")
        // ── Restorative cost basis (used by renderCost override) ───
        restorativeCosts: {
          slot1: Math.round((bySlot['implant']?.id === 'onlay'
            ? c.costs.overlay               // R2.1: clinic-configurable onlay/overlay price
            : bySlot['implant']?.id === 'endocrown'
            ? (c.costs.crown * 0.9)         // endocrown ≈ 90% (no post/buildup needed)
            : c.costs.crown + (c.costs.postCore * (c.restorative.fairStructure ? 1 : 0))) * 10) / 10,
          slot2: c.costs.crown + (c.restorative.needsRCT ? c.costs.rct : 0),
          slot3: Math.round((bySlot['crown']?.id === 'endocrown'
            ? c.costs.crown * 0.9           // endocrown ≈ 90% (no post needed)
            : bySlot['crown']?.id === 'extract_impl'
            ? c.costs.implant                // Wave C3: priority chain via normalize()
            : c.costs.crown) * 10) / 10,
        },
      };
    }

    // ── PUBLIC API: process(state) ─────────────────────────────────
    // Single entry point for all clinical reasoning. Render functions
    // call this instead of calcAI/calcAIMulti directly.
    /**
     * @param {Partial<PatientState>} state
     * @returns {ProcessResult|null}
     */
    function process(state) {
      // Null guard: any invalid state degrades to null (callers check for null)
      if (!state || typeof state !== 'object') return null;
      if (!state.bone || !state.hygiene || !state.occlusion) return null;
      const c = normalize(state);
      const caseClass = classify(c);
      // MISSING paths: delegate entirely to existing engines (zero regression risk)
      if (caseClass.type === CT.MISSING_SINGLE) {
        const ai = calcAI(state);
        return ai ? { ...ai, treatmentMode: 'single', caseClass, clinical: c } : null;
      }
      if (caseClass.type === CT.MISSING_MULTI) {
        const ai = calcAIMulti(state);
        return ai ? { ...ai, treatmentMode: 'multi', caseClass, clinical: c } : null;
      }
      // RESTORATIVE path: full structured pipeline
      const baseAI    = calcAI(state);
      if (!baseAI) return null;
      const treatments = generateTreatments(caseClass, c);
      const scored     = scoreRestorative(treatments, c, baseAI, caseClass);
      let recResult    = recommend(scored, baseAI, caseClass);
      // Young patient extraction restraint: when extraction wins in a COMPROMISED case
      // for a patient under 40, soften confidence to reflect the clinical imperative
      // to exhaust preservation options before committing to early-life tooth loss.
      // Not applied in HOPELESS (extraction is clinically mandatory regardless of age).
      if (caseClass.type === CT.RESTORATIVE_COMPROMISED &&
          recResult.rec === 'crown' && c.patient.young) {
        const adjConf = Math.max(35, recResult.conf - 6);
        recResult = { ...recResult, conf: adjConf,
          confLevel: adjConf >= 75 ? 'High' : adjConf >= 55 ? 'Medium' : 'Low' };
      }
      const expl       = explain(scored, recResult, caseClass, c);
      return buildRestorativeResult(scored, recResult, expl, caseClass, c, baseAI, treatments);
    }

    // ── PUBLIC: processCompound(state) ────────────────────────────
    // Compound multi-site reasoning: two independent sites, each processed
    // through the full 7-stage pipeline. Shared patient-level factors
    // (periodontal, systemic) apply to both sites; restorative profile
    // is independent per site.
    /**
     * @param {Partial<PatientState>} state
     * @returns {CompoundAIResult|null}
     */
    function processCompound(state) {
      // Site 1 uses the primary state as-is (no modification)
      const site1State = { ...state, multiTooth: false, multiSite: false };
      // Site 2 builds a derived state from site2* fields
      const site2State = {
        ...state,
        tooth:               state.site2Tooth      || '#11',
        condition:           state.site2Condition   || 'Missing tooth',
        remainingStructure:  state.site2Structure   || 'Good',
        endodonticStatus:    state.site2EndoStatus  || 'No RCT needed',
        multiTooth: false, multiSite: false,
        // Shared patient-level: bone, hygiene, occlusion, smoking, diabetes, parafunction
        // These are periodontal/systemic — they affect ALL teeth of the same patient
      };
      const ai1 = process(site1State);
      const ai2 = process(site2State);
      if (!ai1 && !ai2) return null;
      return {
        isCompound: true,
        site1: ai1,
        site2: ai2,
        site1Tooth: state.tooth,
        site2Tooth: state.site2Tooth || '#11',
        site1Condition: state.condition,
        site2Condition: state.site2Condition || 'Missing tooth',
      };
    }

    return Object.freeze({ process, processCompound, normalize, classify, CT });
  })();
