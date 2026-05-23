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
    const highOcc = state.occlusion === 'High occlusion load';
    const matSel  = state.selectedMaterial; // 'primary' | 'alt' | null

    // R3.5: Restorative-mode gates — in restorative mode, state.tx keys map to clinical slots
    // whose treatment id may be onlay/crown/splinted, NOT the raw implant/bridge/crown.
    // Applying bridge or implant material add-ons to those slots is semantic leakage.
    const isRestorative = ai?.treatmentMode === 'restorative';
    // Overlay slot: restorative slot1 is onlay → uses overlay base price, not implant base.
    const isOverlaySlot = isRestorative &&
                          ai?.restorativeLabels?.slot1?.id === 'onlay' &&
                          state.tx === 'implant';

    // R3.4 (R3.5 gate): Bridge material add-on — not applicable in restorative mode.
    // In restorative mode, state.tx='bridge' maps to slot2 (crown/splinted), not a bridge.
    const isZirconiaBridge = state.tx === 'bridge' && !isRestorative &&
      ((matSel === 'primary' && highOcc) || (matSel === 'alt' && !highOcc));
    const isEmaxBridge = state.tx === 'bridge' && !isRestorative &&
      ((matSel === 'primary' && !highOcc) || (matSel === 'alt' && highOcc));
    const bridgeMaterialAdd = isZirconiaBridge ? getClinicPrice('matZirconia')
                            : isEmaxBridge     ? getClinicPrice('matEmax')
                            : 0;

    // R3.4 (R3.5 gate): All-Zirconia fixture — not applicable in overlay restorative slot.
    const implantMaterialAdd = (matSel === 'alt' && state.tx === 'implant' && !isOverlaySlot)
      ? getClinicPrice('matAllZirconia') : 0;

    // R3.5: Overlay material add-on — applies when restorative slot1 is onlay/overlay.
    const overlayBase = isOverlaySlot
      ? (state.costOverlay != null ? state.costOverlay : getClinicPrice('overlay')) : 0;
    const overlayMaterialAdd = isOverlaySlot
      ? (matSel === 'primary' ? getClinicPrice('matOverlayCeramic')
       : matSel === 'alt'     ? getClinicPrice('matOverlayComposite')
       : 0) : 0;

    const implantInitial = isOverlaySlot
      ? overlayBase + overlayMaterialAdd
      : implantBase + implantMaterialAdd + (state.bone === 'Poor' ? graftCost : 0);
    const bridgeInitialAdjusted = bridgeBase + bridgeMaterialAdd;
    const needsRCT      = state.endodonticStatus === 'Needs RCT';
    const needsPostCore = (state.remainingStructure === 'Fair' || state.remainingStructure === 'Poor');
    const _crownViable  = ai?.crownViable === true;

    // R3.5: Crown material add-on — absolute dollar amounts, treatment-scoped, clinic-configurable.
    // Mirrors getCrownMaterial() case logic; both must stay in sync if case branches change.
    // Case 1 (bruxism/high+posterior): alt=Layered Zirconia over Monolithic → matCrownZirconia ($96)
    // Case 2 (anterior/low): alt=Layered Zirconia over e.max → matCrownZirconia (same entry, approx.)
    // Case 3 (moderate): alt=e.max Crown over Zirconia → matCrownEmax ($0 default; set negative if e.max costs less)
    let crownMaterialAdd = 0;
    if (matSel === 'alt' && state.tx === 'crown' && _crownViable) {
      const posterior = isPosteriorTooth(state.tooth);
      const bruxism   = (state.parafunction === 'Bruxism' || state.parafunction === 'Both');
      crownMaterialAdd = (bruxism || (highOcc && posterior) || (!highOcc && !posterior))
        ? getClinicPrice('matCrownZirconia')  // Layered Zirconia variant (cases 1 & 2)
        : getClinicPrice('matCrownEmax');     // e.max Crown variant (case 3)
    }
    const crownInitial = _crownViable
      ? (crownBase + crownMaterialAdd) + (needsRCT ? rctCost : 0) + (needsPostCore ? postCoreCost : 0)
      : 0;
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
