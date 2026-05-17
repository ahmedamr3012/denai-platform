  // ── Shared report shell (header + CSS + footer wrapper) ─────────
  function rptShell(cfg, bodyHTML) {
    const cc = (v) => v==='High'?'#dc2626':v==='Medium'?'#d97706':'#16a34a';
    const confC = cc(cfg.confLevel);
    const circum = (2 * Math.PI * 26).toFixed(1);
    const offset = ((1 - (cfg.conf||50)/100) * 2 * Math.PI * 26).toFixed(1);
    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(cfg.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>${REPORT_CSS}</style></head><body>
<div class="page-wrap">
<div class="rpt-header">
  <div class="rpt-brand"><div>
    <div style="display:flex;align-items:center;gap:10px">
      <div class="rpt-logo">denai</div>
      <div class="rpt-logo-badge">AI Workflow</div>
    </div>
    <div class="rpt-tagline">AI-Assisted Clinical Workflow</div>
  </div></div>
  <div class="rpt-meta-box">
    <div class="rpt-case-num">${escapeHtml(cfg.caseNumber)}</div>
    <div class="rpt-date">Generated <span>${cfg.date}</span> at <span>${cfg.time}</span></div>
  </div>
</div>
<div class="conf-banner">
  <div class="conf-main">
    <svg class="conf-ring" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="26" fill="none" stroke="#D1FAE5" stroke-width="6"/>
      <circle cx="32" cy="32" r="26" fill="none" stroke="#1F7A4F" stroke-width="6"
        stroke-linecap="round" stroke-dasharray="${circum}" stroke-dashoffset="${offset}"
        transform="rotate(-90 32 32)"/>
      <text x="32" y="37" text-anchor="middle" font-family="Sora,sans-serif" font-size="13" font-weight="800" fill="#1F7A4F">${cfg.conf}%</text>
    </svg>
    <div>
      <div class="conf-label">Recommendation Strength</div>
      <div class="conf-value">${cfg.conf}%</div>
      <div class="conf-level" style="background:${confC}">${cfg.confLevel}</div>
    </div>
  </div>
  <div class="conf-rec-box">
    <div class="conf-rec-label">AI-Generated Recommendation</div>
    <div class="conf-rec-val">${escapeHtml(cfg.aiRec)}</div>
    <div class="conf-rec-sub">${escapeHtml(cfg.recSub || '')}</div>
    <div class="conf-rec-sub" style="margin-top:3px">Patient: <strong>${escapeHtml(cfg.patientName)}</strong></div>
  </div>
</div>
${bodyHTML}
<div class="rpt-footer" style="flex-direction:column;gap:6px;padding-top:14px;padding-bottom:14px">
  <span style="font-size:10px;color:#9CA3AF;text-align:center;line-height:1.6;width:100%">${BRAND.disclaimer}</span>
  <div style="display:flex;justify-content:space-between;width:100%">
    <span>${BRAND.footerLine} · <strong>${escapeHtml(cfg.caseNumber)}</strong> · ${escapeHtml(cfg.patientName)}</span>
    <span>${cfg.date}</span>
  </div>
</div>
<div class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ &nbsp;Save as PDF / Print</button>
  <p style="font-size:11px;color:#9CA3AF;margin-top:8px">Use browser's "Save as PDF" in the print dialog</p>
</div>
</div>${'</'+'body></'+'html>'}` ;
  }

  // ── Patient grid section (shared by all case types) ──────────────
  function rptPatientSection(state, toothDisplay) {
    const smokingColor = (state.smoking||'Non-smoker')==='Current smoker'?'#dc2626':(state.smoking==='Former smoker'?'#d97706':'#16a34a');
    const dmColor = (state.diabetes||'None')==='Uncontrolled'?'#dc2626':state.diabetes==='Controlled'?'#d97706':'#16a34a';
    return `<div class="section"><div class="sec-title">Patient Summary</div><div class="patient-grid">
    <div class="pfield"><div class="pfield-label">Patient</div><div class="pfield-val">${escapeHtml(state.name)}</div></div>
    <div class="pfield"><div class="pfield-label">Age / Gender</div><div class="pfield-val">${state.age} yrs, ${escapeHtml(state.gender)}</div></div>
    <div class="pfield"><div class="pfield-label">Tooth #</div><div class="pfield-val">${toothDisplay}</div></div>
    <div class="pfield"><div class="pfield-label">Condition</div><div class="pfield-val">${escapeHtml(state.condition)}</div></div>
    <div class="pfield"><div class="pfield-label">Bone Quality</div><div class="pfield-val">${state.bone}</div></div>
    <div class="pfield"><div class="pfield-label">Oral Hygiene</div><div class="pfield-val">${state.hygiene}</div></div>
    <div class="pfield"><div class="pfield-label">Occlusion</div><div class="pfield-val">${escapeHtml(state.occlusion)}</div></div>
    <div class="pfield"><div class="pfield-label">Smoking</div><div class="pfield-val" style="color:${smokingColor}">${escapeHtml(state.smoking||'Non-smoker')}</div></div>
    <div class="pfield"><div class="pfield-label">Diabetes</div><div class="pfield-val" style="color:${dmColor};font-weight:700">${escapeHtml(state.diabetes||'None')}</div></div>
    <div class="pfield"><div class="pfield-label">Jaw / Arch</div><div class="pfield-val">${isMaxilla(state.tooth)?'Upper (Maxilla)':'Lower (Mandible)'}</div></div>
    </div></div>`;
  }

  // ── Risk section (shared; derives from state when ai fields missing) ─
  function rptRiskSection(state, ai) {
    const rv = (v) => `<div class="risk-pill ${(v||'low').toLowerCase()}">${v||'Low'}</div>`;
    const peri     = ai?.peri     || (state.hygiene==='Poor'?'High':state.hygiene==='Fair'?'Medium':'Low');
    const boneR    = ai?.boneR    || (state.bone==='Poor'?'High':state.bone==='Fair'?'Medium':'Low');
    const occR     = ai?.occR     || (state.occlusion==='High occlusion load'?'Medium':'Low');
    const smokingR = ai?.smokingR || (state.smoking==='Current smoker'?'High':state.smoking==='Former smoker'?'Medium':'Low');
    const diabR    = ai?.diabetesR|| (state.diabetes==='Uncontrolled'?'High':state.diabetes==='Controlled'?'Medium':'Low');
    return `<div class="section"><div class="sec-title">Risk Indicators</div><div class="risk-grid">
    <div class="risk-cell"><div class="risk-cell-label">Peri-implantitis</div>${rv(peri)}</div>
    <div class="risk-cell"><div class="risk-cell-label">Bone Loss Risk</div>${rv(boneR)}</div>
    <div class="risk-cell"><div class="risk-cell-label">Occlusal Overload</div>${rv(occR)}</div>
    <div class="risk-cell"><div class="risk-cell-label">Smoking Risk</div>${rv(smokingR)}</div>
    ${(state.diabetes&&state.diabetes!=='None')?`<div class="risk-cell"><div class="risk-cell-label">Diabetes Risk</div>${rv(diabR)}</div>`:''}
    <div class="risk-cell"><div class="risk-cell-label">Jaw Zone</div><div class="risk-pill ${isMaxilla(state.tooth)&&isPosteriorTooth(state.tooth)?'medium':'low'}">${isMaxilla(state.tooth)?'Maxilla':'Mandible'} — ${isPosteriorTooth(state.tooth)?'Post':'Ant'}</div></div>
    </div></div>`;
  }

  // ── Opt card (shared treatment option card) ─────────────────────
  function rptOptCard(opt) {
    const rows = opt.rows.map(r => `<div class="opt-row"><span class="opt-row-label">${escapeHtml(r.label)}</span><span class="opt-row-val">${r.value}</span></div>`).join('');
    return `<div class="opt-card ${opt.isRec?'winner':''}">
    <div class="opt-card-head">
      <div class="opt-card-title">${escapeHtml(opt.label)}</div>
      <div class="opt-rec-badge ${opt.isRec?'rec':'alt'}">${opt.isRec?'★ Recommended':'Alternative'}</div>
    </div>
    <div class="opt-card-body">
      <div class="opt-rate">${(+opt.score||0).toFixed(1)}%</div>
      <div class="opt-rate-label">${escapeHtml(opt.rateLabel||'Success Rate')}</div>
      ${rows}
    </div></div>`;
  }

  // ── Reasons section ─────────────────────────────────────────────
  function rptReasonsSection(reasons) {
    if (!reasons?.length) return '';
    const items = reasons.slice(0, 4).map(r => `<li style="font-size:12px;color:#374151;margin-bottom:4px;padding-left:4px">${escapeHtml(r)}</li>`).join('');
    return `<div class="section"><div class="sec-title">Clinical Reasoning</div><ul style="padding-left:16px;margin:0">${items}</ul></div>`;
  }
