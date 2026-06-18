function _getAiForPlan(state) {
  if (!state.condition) return null;
  try {
    if (state.multiSite && state.site2Tooth) {
      const compound = ClinicalEngine.processCompound(state);
      return compound ? (state.activeSite === 2 ? compound.site2 : compound.site1) : null;
    }
    return ClinicalEngine.process(state);
  } catch (e) { return null; }
}

// bug-168: AI recommends (ai.rec); clinician decides (S.tx). Operational plan/lab
// rendering (timeline, material, pathway, lab header) must follow the SELECTION
// while the AI recommendation stays visible. Vocabularies align: single & restorative
// = implant|bridge|crown, multi = implant2|bridge4|cantilever. In restorative mode
// rec is a SLOT KEY (not the procedure id), so the display label is remapped via the
// slot map. The ClinicalEngine, scoring, and confidence are never touched.
function _planSelValid(ai, sel) {
  if (!ai || !sel) return false;
  if (ai.isMultiTooth) return !!({ implant2: 1, bridge4: 1, cantilever: 1 })[sel];
  return !!({ implant: 1, bridge: 1, crown: 1 })[sel];
}

function _planTxLabel(ai, key) {
  if (!ai || !key) return '—';
  if (ai.treatmentMode === 'restorative') {
    const SLOT = { implant: 'slot1', bridge: 'slot2', crown: 'slot3' };
    return ai.restorativeLabels?.[SLOT[key]]?.label || ai.recDisplay || 'Crown';
  }
  if (ai.isMultiTooth)
    return ({ implant2: '2 Implants', bridge4: '4-Unit Bridge', cantilever: 'Implant + Cantilever' })[key] || key;
  return ({ implant: 'Implant', bridge: 'Bridge', crown: 'Crown' })[key] || key;
}

// Returns ai unchanged when there is no valid divergent selection; otherwise a
// shallow clone with rec (and restorative recDisplay) pointed at the selection.
function _planEffectiveAi(ai, sel) {
  if (!_planSelValid(ai, sel) || sel === ai.rec) return ai;
  if (ai.treatmentMode === 'restorative') {
    const SLOT = { implant: 'slot1', bridge: 'slot2', crown: 'slot3' };
    const selTreatmentId = ai.scored?.find(t => t.slot === sel)?.id || null;
    return { ...ai, rec: sel, recDisplay: ai.restorativeLabels?.[SLOT[sel]]?.label || ai.recDisplay, recTreatmentId: selTreatmentId };
  }
  return { ...ai, rec: sel };
}

function _buildTreatmentPathRows(ai, primaryLabel) {
  if (!ai) return '';
  const PRIMARY = primaryLabel || 'Recommended';
  const rows = [];
  if (ai.treatmentMode === 'restorative') {
    rows.push({ label: PRIMARY, val: ai.recDisplay || 'Crown', hi: true });
    if (ai.caseClass?.label) rows.push({ label: 'Classification', val: ai.caseClass.label });
    if (ai.scored && ai.restorativeLabels) {
      const bySlot = {}; ai.scored.forEach(t => { bySlot[t.slot] = t; });
      if (bySlot['bridge'] && ai.rec !== 'bridge' && ai.restorativeLabels.slot2?.label)
        rows.push({ label: 'Alt. 2', val: ai.restorativeLabels.slot2.label + (ai.bridge != null ? ' — ' + ai.bridge.toFixed(1) + '%' : ''), dim: true });
      if (bySlot['crown'] && ai.rec !== 'crown' && ai.restorativeLabels.slot3?.label)
        rows.push({ label: 'Alt. 3', val: ai.restorativeLabels.slot3.label + (ai.crown != null ? ' — ' + ai.crown.toFixed(1) + '%' : ''), dim: true });
    }
  } else if (ai.isMultiTooth) {
    const labels = { implant2: '2 Implants', bridge4: '4-Unit Bridge', cantilever: 'Implant + Cantilever' };
    rows.push({ label: PRIMARY, val: labels[ai.rec] || ai.rec, hi: true });
    if (ai.ideal && ai.ideal !== ai.rec) rows.push({ label: 'Ideal option', val: labels[ai.ideal] || ai.ideal, dim: true });
    [['implant2', ai.implant2], ['bridge4', ai.bridge4], ['cantilever', ai.cantilever]].forEach(([k, v]) => {
      if (k !== ai.rec && v != null) rows.push({ label: labels[k], val: v.toFixed(1) + '%', dim: true });
    });
  } else {
    const labels = { implant: 'Implant', bridge: 'Bridge', crown: 'Crown' };
    rows.push({ label: PRIMARY, val: labels[ai.rec] || ai.rec, hi: true });
    if (ai.rec !== 'implant' && ai.implant != null) rows.push({ label: 'Implant',   val: ai.implant.toFixed(1) + '%', dim: true });
    if (ai.rec !== 'bridge'  && ai.bridge  != null) rows.push({ label: 'Bridge',    val: ai.bridge.toFixed(1)  + '%', dim: true });
    if (ai.rec !== 'crown'   && ai.crown   != null && ai.crownViable)
      rows.push({ label: 'Crown', val: ai.crown.toFixed(1) + '%', dim: true });
  }
  return rows.map(r => `<div class="plan-row">
    <div class="plan-row-lbl" style="${r.dim ? 'color:var(--c-n400);font-weight:400;' : ''}">${escapeHtml(r.label)}</div>
    <div class="plan-row-val" style="${r.hi ? 'color:var(--c-brand);' : r.dim ? 'color:var(--c-n400);font-weight:400;' : ''}">${escapeHtml(String(r.val))}</div>
  </div>`).join('');
}
