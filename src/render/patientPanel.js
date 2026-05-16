  // ================================================================
  const BONE_LBL = { Good: ['Good (11.2 mm)','dot-low'], Fair: ['Fair (7‑9 mm)','dot-med'], Poor: ['Poor (<5 mm)','dot-high'] };
  const OCC_LBL  = { 'High occlusion load':'dot-med', Normal:'dot-low', Low:'dot-low' };
  const HYG_LBL  = { Good:'dot-low', Fair:'dot-med', Poor:'dot-high' };

  // ================================================================
  // RENDER: PATIENT DISPLAY
  // ================================================================
  function renderPatientDisplay(state) {
    const grid = $('infoDisplay');
    if (!grid) return;
    const bm = BONE_LBL[state.bone] || BONE_LBL.Good;
    const smokingColor = (state.smoking || 'Non-smoker') === 'Current smoker' ? '#dc2626' : (state.smoking || 'Non-smoker') === 'Former smoker' ? '#d97706' : 'var(--c-success)';
    grid.innerHTML = `
      <div class="info-label"><i class="fa-regular fa-user" aria-hidden="true"></i> Patient</div>
      <div class="info-val"><span id="dPatient">${escapeHtml(state.name)}</span><span class="info-sub">${escapeHtml(state.gender)}, ${escapeHtml(String(state.age))} Y</span></div>
      <div class="info-label"><i class="fa-solid fa-tooth" aria-hidden="true"></i> Tooth / Area</div>
            <div class="info-val">${
        state.multiTooth && state.tooth2
          ? escapeHtml(state.tooth) + ' + ' + escapeHtml(state.tooth2) + ' <span style="font-size:10px;background:var(--c-brand-bg);color:var(--c-brand);padding:2px 6px;border-radius:10px;font-weight:700">2 Missing</span>'
          : escapeHtml(state.tooth)
      } </div>
      <div class="info-label"><i class="fa-solid fa-file-medical" aria-hidden="true"></i> Condition</div>
      <div class="info-val">${escapeHtml(state.condition)}</div>
      <div class="info-label"><i class="fa-solid fa-bone" aria-hidden="true"></i> Bone</div>
      <div class="info-val">${bm[0]} <span role="img" class="dot ${bm[1]}" aria-label="${state.bone} bone quality"></span></div>
      <div class="info-label"><i class="fa-solid fa-teeth-open" aria-hidden="true"></i> Occlusion</div>
      <div class="info-val">${escapeHtml(state.occlusion)} <span role="img" class="dot ${OCC_LBL[state.occlusion]||'dot-low'}" aria-label="${state.occlusion}"></span></div>
      <div class="info-label"><i class="fa-solid fa-sparkles" aria-hidden="true"></i> Hygiene</div>
      <div class="info-val">${escapeHtml(state.hygiene)} <span role="img" class="dot ${HYG_LBL[state.hygiene]}" aria-label="${state.hygiene} hygiene"></span></div>
      <div class="info-label"><i class="fa-solid fa-smoking" aria-hidden="true"></i> Smoking</div>
      <div class="info-val" style="color:${smokingColor};font-weight:700;">${escapeHtml(state.smoking || 'Non-smoker')}</div>
      <div class="info-label"><i class="fa-solid fa-droplet" aria-hidden="true"></i> Diabetes</div>
      <div class="info-val" style="color:${(state.diabetes||'None')==='Uncontrolled'?'#dc2626':(state.diabetes==='Controlled'?'#d97706':'var(--c-success)')};font-weight:700;">${escapeHtml(state.diabetes||'None')}</div>
      <div class="info-label"><i class="fa-solid fa-teeth-open" aria-hidden="true"></i> Jaw</div>
      <div class="info-val">${isMaxilla(state.tooth)?'Upper (Maxilla)':'Lower (Mandible)'}</div>`;
  }
