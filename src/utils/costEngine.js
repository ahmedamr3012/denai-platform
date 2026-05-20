  // ── Literature-backed 10-year clinical constants ───────────────
  // These are evidence-based statistics, NOT pricing preferences.
  // Do NOT route through getClinicPrice() — they are immutable clinical data.
  const CROWN_REPLACE_PROB    = 0.12;  // 12% implant crown replacement in 10 yrs
  const CROWN_COST_RATIO      = 0.33;  // Crown ≈ 33% of implant total cost
  const BRIDGE_REPLACE_PROB   = 0.28;  // 28% bridge failure at 10 yrs (NIH data)
  const BRIDGE_REPLACE_RATIO  = 0.90;  // Replacement = 90% of original cost
  const STANDALONE_CROWN_REPLACE_PROB  = 0.15;  // 15% standalone crown replacement in 10 yrs
  const STANDALONE_CROWN_REPLACE_RATIO = 0.80;  // 80% of original crown cost

  function computeCosts(state, ai) {
    // Wave C3: annualCheckup reads from clinic pricing at call time.
    // 2 visits/yr × per-visit price. Computed inside the function so it
    // always reflects the current clinic pricing, not a stale load-time const.
    const annualCheckup = getClinicPrice('annualCheckup') * 2;
    if (!state) return {
      implantInitial: getClinicPrice('implant'),
      bridgeInitialAdjusted: getClinicPrice('bridge'),
      crownInitial: 0, needsRCT: false, needsPostCore: false,
      implant10yr: getClinicPrice('implant') + annualCheckup * 10,
      bridge10yr:  getClinicPrice('bridge')  + annualCheckup * 10,
      crown10yr: 0, bestValue: 'Implant', reason: 'No data',
    };
    // Wave C3: priority chain — patient override → clinic preference → catalog default.
    // getClinicPrice() already handles tiers 2+3; state.costX covers tier 1.
    const implantBase  = state.costImplant   != null ? state.costImplant   : getClinicPrice('implant');
    const bridgeBase   = state.costBridge    != null ? state.costBridge    : getClinicPrice('bridge');
    const graftCost    = state.costBoneGraft != null ? state.costBoneGraft : getClinicPrice('boneGraft');
    const crownBase    = state.costCrown     != null ? state.costCrown     : getClinicPrice('crown');
    const rctCost      = state.costRCT       != null ? state.costRCT       : getClinicPrice('rct');
    const postCoreCost = state.costPostCore  != null ? state.costPostCore  : getClinicPrice('postCore');
    const implantInitial = implantBase + (state.bone === 'Poor' ? graftCost : 0);
    const bridgeMaterialUpcharge  = state.occlusion === 'High occlusion load' ? 0.15 : 0;
    const bridgeInitialAdjusted   = bridgeBase * (1 + bridgeMaterialUpcharge);
    const needsRCT      = state.endodonticStatus === 'Needs RCT';
    const needsPostCore = (state.remainingStructure === 'Fair' || state.remainingStructure === 'Poor');
    const _crownViable  = ai?.crownViable === true;
    const crownInitial  = _crownViable ? crownBase + (needsRCT ? rctCost : 0) + (needsPostCore ? postCoreCost : 0) : 0;
    const implant10yr = implantInitial + (annualCheckup * 10) + (implantInitial * CROWN_COST_RATIO * CROWN_REPLACE_PROB);
    const bridge10yr  = bridgeInitialAdjusted + (annualCheckup * 10) + (bridgeInitialAdjusted * BRIDGE_REPLACE_PROB * BRIDGE_REPLACE_RATIO);
    const crown10yr   = _crownViable ? crownInitial + (annualCheckup * 10) + (crownInitial * STANDALONE_CROWN_REPLACE_PROB * STANDALONE_CROWN_REPLACE_RATIO) : 0;
    let bestValue = '', reason = '';
    if (ai) {
      const implantValue = ai.implant / implant10yr;
      const bridgeValue  = ai.bridge  / bridge10yr;
      const crownValue   = (ai.crownViable && ai.crown > 0) ? ai.crown / crown10yr : 0;
      if (crownValue > implantValue && crownValue > bridgeValue) {
        bestValue = 'Crown'; reason = 'Crown offers best success-per-dollar — lowest initial cost, preserve natural tooth';
      } else if (implantValue >= bridgeValue) {
        bestValue = 'Implant'; reason = 'Implant offers higher success‑per‑dollar over 10 years (no replacement needed)';
      } else {
        bestValue = 'Bridge'; reason = 'Bridge provides better cost‑effectiveness despite replacement risk';
      }
    } else {
      const minCost = Math.min(implant10yr, bridge10yr, crown10yr);
      bestValue = minCost === crown10yr ? 'Crown' : minCost === implant10yr ? 'Implant' : 'Bridge';
      reason = 'Based on projected 10‑year total cost';
    }
    return { implantInitial, bridgeInitialAdjusted, crownInitial, needsRCT, needsPostCore, implant10yr, bridge10yr, crown10yr, bestValue, reason };
  }
