  // ================================================================
  // RENDER: COST
  // ================================================================
  function renderCost(state, ai) {
    const container = $('costContainer');
    if (!container) return;

    // ── RESTORATIVE COST DISPLAY ─────────────────────────────────
    if (ai?.treatmentMode === 'restorative' && ai.restorativeLabels) {
      const { slot1, slot2, slot3 } = ai.restorativeLabels;
      const rc = ai.restorativeCosts || {};
      // Wave C3: 2 visits/yr × per-visit clinic price
      const checkupAnnual = getClinicPrice('annualCheckup') * 2;
      const s1_10yr = rc.slot1 ? Math.round(rc.slot1 + checkupAnnual * 10) : null;
      const s2_10yr = rc.slot2 ? Math.round(rc.slot2 + checkupAnnual * 10 + rc.slot2 * 0.15 * 0.8) : null;
      const s3_10yr = rc.slot3 ? Math.round(rc.slot3 + checkupAnnual * 10) : null;
      container.innerHTML = `
        <div class="cost-title"><i class="fa-solid fa-circle-dollar-to-slot" aria-hidden="true"></i> Restorative Cost Estimate</div>
        <div class="cost-row"><span>${escapeHtml(slot1.label)} — Initial</span><strong>${rc.slot1 ? formatCurrency(rc.slot1) : 'N/A'}</strong></div>
        <div class="cost-row"><span>${escapeHtml(slot2.label)} — Initial</span><strong>${rc.slot2 ? formatCurrency(rc.slot2) : 'N/A'}</strong></div>
        <div class="cost-row"><span>${escapeHtml(slot3.label)} — Initial</span><strong>${rc.slot3 ? formatCurrency(rc.slot3) : 'N/A'}</strong></div>
        ${s1_10yr ? `<div class="cost-row"><span>${escapeHtml(slot1.label)} 10‑yr total</span><strong>${formatCurrency(s1_10yr)}</strong></div>` : ''}
        ${s2_10yr ? `<div class="cost-row"><span>${escapeHtml(slot2.label)} 10‑yr total</span><strong>${formatCurrency(s2_10yr)}</strong></div>` : ''}
        ${s3_10yr ? `<div class="cost-row"><span>${escapeHtml(slot3.label)} 10‑yr total</span><strong>${formatCurrency(s3_10yr)}</strong></div>` : ''}
        <div class="cost-best"><i class="fa-solid fa-star"></i> ${escapeHtml(slot1.label)} — lowest initial investment preserving natural tooth</div>
        <div style="font-size:9.5px;color:var(--c-n400);margin-top:6px;line-height:1.5;">* Based on entered cost inputs · Lab and clinical complexity may vary</div>
      `;
      return;
    }

    // ── Multi-tooth cost display ─────────────────────────────
    if (ai?.isMultiTooth) {
      const mtCosts = ai.costs;
      if (!mtCosts) return;
      // Wave C3: 2 visits/yr × per-visit clinic price
      const ANNUAL_CHECKUP = getClinicPrice('annualCheckup') * 2;
      const imp2_10yr  = mtCosts.implant2   + ANNUAL_CHECKUP * 10;
      const bri4_10yr  = mtCosts.bridge4    + ANNUAL_CHECKUP * 10 + Math.round(mtCosts.bridge4 * 0.28 * 0.90);
      const cant_10yr  = mtCosts.cantilever + ANNUAL_CHECKUP * 10;
      const lowestCost = Math.min(imp2_10yr, bri4_10yr, cant_10yr);
      container.innerHTML = `
        <div class="cost-grid" style="display:grid;gap:10px">
          <div class="cost-row" style="font-weight:700;color:var(--c-n700);border-bottom:1px solid var(--c-n100);padding-bottom:8px">
            Multi-Tooth Cost Analysis — Teeth ${escapeHtml(formatTooth(state.tooth))} + ${escapeHtml(state.tooth2 ? formatTooth(state.tooth2) : '')}
          </div>
          <div class="cost-row"><span>2 Implants initial</span><span style="font-weight:700">${formatCurrency(mtCosts.implant2)}</span></div>
          <div class="cost-row"><span>4-Unit Bridge initial</span><span style="font-weight:700">${formatCurrency(mtCosts.bridge4)}</span></div>
          <div class="cost-row"><span>Implant + Cantilever</span><span style="font-weight:700">${formatCurrency(mtCosts.cantilever)}</span></div>
          <div style="border-top:1px solid var(--c-n100);padding-top:8px;display:flex;flex-direction:column;gap:6px">
            <div class="cost-row${imp2_10yr === lowestCost ? ' cost-best' : ''}"><span>2 Implants 10-yr</span><span style="font-weight:700;color:${imp2_10yr===lowestCost?'var(--c-brand)':'var(--c-n700)'}">${formatCurrency(imp2_10yr)}${imp2_10yr===lowestCost?' ✓':''}</span></div>
            <div class="cost-row${bri4_10yr === lowestCost ? ' cost-best' : ''}"><span>Bridge 4-unit 10-yr</span><span style="font-weight:700;color:${bri4_10yr===lowestCost?'var(--c-brand)':'var(--c-n700)'}">${formatCurrency(bri4_10yr)}${bri4_10yr===lowestCost?' ✓':''}</span></div>
            <div class="cost-row${cant_10yr === lowestCost ? ' cost-best' : ''}"><span>Cantilever 10-yr</span><span style="font-weight:700;color:${cant_10yr===lowestCost?'var(--c-brand)':'var(--c-n700)'}">${formatCurrency(cant_10yr)}${cant_10yr===lowestCost?' ✓':''}</span></div>
          </div>
          <div style="padding:10px 12px;background:var(--c-brand-bg);border-radius:var(--r-md);border:1.5px solid rgba(var(--c-brand-rgb),.2);font-size:12px;color:var(--c-brand);font-weight:600">
            ★ Lowest 10-yr cost: ${bri4_10yr < imp2_10yr && bri4_10yr < cant_10yr ? '4-Unit Bridge (' + formatCurrency(bri4_10yr) + ')' : imp2_10yr < cant_10yr ? '2 Implants (' + formatCurrency(imp2_10yr) + ')' : 'Cantilever (' + formatCurrency(cant_10yr) + ')'}
          </div>
        </div>`;
      return;
    }

    const { implantInitial, bridgeInitialAdjusted, implant10yr, bridge10yr, bestValue, reason } = computeCosts(state, ai);
    const bridgeReplacement = Math.round(bridgeInitialAdjusted * BRIDGE_REPLACE_RATIO);
    const boneLine = state.bone === 'Poor'
      ? `<div class="cost-row" style="color:var(--c-n500);font-size:12px;"><span>↳ incl. bone graft</span><strong>+${formatCurrency(state.costBoneGraft || getClinicPrice('boneGraft'))}</strong></div>` : '';

    // Fix 5: Risk mitigation costs
    const smokingStatus = state.smoking || 'Non-smoker';
    const riskCostRows = [];
    if (state.bone === 'Poor') riskCostRows.push({ label: 'Bone graft complication', cost: 1200 });
    if (smokingStatus === 'Current smoker') riskCostRows.push({ label: 'Implant re-treatment (smoker)', cost: 2800 });
    if (smokingStatus === 'Former smoker') riskCostRows.push({ label: 'Implant revision risk', cost: 1500 });
    if (state.hygiene === 'Poor') riskCostRows.push({ label: 'Peri-implantitis treatment', cost: 900 });
    const riskMitigationHtml = riskCostRows.length > 0 ? `
      <div style="margin-top:8px;padding:8px 10px;background:rgba(239,68,68,.07);border-radius:var(--r-sm);border:1px solid rgba(239,68,68,.18);">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#dc2626;letter-spacing:.05em;margin-bottom:6px;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i>If complication occurs…</div>
        ${riskCostRows.map(r => `<div class="cost-row" style="font-size:12px;"><span>${escapeHtml(r.label)}</span><strong style="color:#dc2626;">~${formatCurrency(r.cost)}</strong></div>`).join('')}
      </div>` : '';

    // Wave C3: compute locally — global ANNUAL_CHECKUP removed from costEngine.js top level.
    const checkupPerYear = getClinicPrice('annualCheckup') * 2; // 2 visits/yr
    const checkupTotal = checkupPerYear * 10;
    const implantCrownRisk = Math.round(implantInitial * CROWN_COST_RATIO * CROWN_REPLACE_PROB);
    const bridgeReplaceRisk = Math.round(bridgeInitialAdjusted * BRIDGE_REPLACE_PROB * BRIDGE_REPLACE_RATIO);

    const { crownInitial, needsRCT, needsPostCore, crown10yr } = computeCosts(state, ai);
    const rctDisplay      = state.costRCT      || getClinicPrice('rct');
    const postCoreDisplay = state.costPostCore || getClinicPrice('postCore');
    const crownLine = ai?.crownViable
      ? `<div class="cost-row"><span>Crown initial <span style="font-size:10px;">${needsRCT ? '(+RCT ' + formatCurrency(rctDisplay) + ') ' : ''}${needsPostCore ? '(+Post&amp;Core ' + formatCurrency(postCoreDisplay) + ')' : ''}</span></span><strong>${formatCurrency(crownInitial)}</strong></div>` : '';
    const crown10yrLine = ai?.crownViable
      ? `<div class="cost-row" style="font-weight:700;"><span>Crown 10‑yr total</span><strong style="color:var(--c-brand);">${formatCurrency(crown10yr)}</strong></div>` : '';
    const crownReplaceRisk = ai?.crownViable ? Math.round(crownInitial * STANDALONE_CROWN_REPLACE_PROB * STANDALONE_CROWN_REPLACE_RATIO) : 0;

    container.innerHTML = `
      <div class="cost-row"><span>Implant initial</span><strong>${formatCurrency(implantInitial)}</strong></div>
      ${boneLine}
      <div class="cost-row"><span>Bridge initial</span><strong>${formatCurrency(bridgeInitialAdjusted)}</strong></div>
      ${crownLine}
      <div class="cost-row" style="border-top:1px solid var(--c-n100); padding-top:8px; margin-top:4px; font-size:11.5px; color:var(--c-n500);">
        <span>Checkups (all) <span style="font-size:10px;">2×/yr × ${formatCurrency(getClinicPrice('annualCheckup'))} × 10yr</span></span>
        <span>${formatCurrency(checkupTotal)}</span>
      </div>
      <div class="cost-row" style="font-size:11.5px; color:var(--c-n500);">
        <span>Implant crown replacement risk <span style="font-size:10px;">~12% prob.</span></span>
        <span>~${formatCurrency(implantCrownRisk)}</span>
      </div>
      <div class="cost-row" style="font-size:11.5px; color:var(--c-n500);">
        <span>Bridge replacement risk <span style="font-size:10px;">~28% prob.</span></span>
        <span>~${formatCurrency(bridgeReplaceRisk)}</span>
      </div>
      ${ai?.crownViable ? `<div class="cost-row" style="font-size:11.5px; color:var(--c-n500);"><span>Crown replacement risk <span style="font-size:10px;">~15% prob.</span></span><span>~${formatCurrency(crownReplaceRisk)}</span></div>` : ''}
      <div class="cost-row" style="border-top:1px solid var(--c-n100); padding-top:8px; margin-top:4px; font-weight:700;">
        <span>Implant 10‑yr total</span>
        <strong>${formatCurrency(implant10yr)}</strong>
      </div>
      <div class="cost-row" style="font-weight:700;">
        <span>Bridge 10‑yr total</span>
        <strong>${formatCurrency(bridge10yr)}</strong>
      </div>
      ${crown10yrLine}
      <div class="cost-best"><i class="fa-solid fa-star"></i> Best Overall Value: ${bestValue}</div>
      <div style="font-size:10px; color:var(--c-n500); margin-top:4px;">${reason}</div>
      <div style="font-size:9.5px; color:var(--c-n400); margin-top:6px; line-height:1.5;">* Bridge wins at 10 yrs on cost — Implant wins long-term (20+ yrs, no full replacement needed)</div>
      ${riskMitigationHtml}
    `;
  }

  // ================================================================
  // RENDER: GRAPH (SVG) — CLINICAL CLARITY + DENSITY CALIBRATION
  // ================================================================
  function renderGraph(ai) {
    const container = $('graphContainer');
    if (!container) return;
    if (!ai) {
      container.innerHTML = '<div class="empty-state" style="padding:14px;"><i class="fa-solid fa-chart-line" aria-hidden="true" style="font-size:24px;color:var(--c-brand);"></i><h4 style="font-size:14px;margin-top:8px;color:var(--c-n800);">No Projection Data</h4><p style="font-size:11px;color:var(--c-n500);margin-top:4px;">Complete patient profile to see success projection.</p></div>';
      return;
    }
    if (ai?.isMultiTooth) return;

    const _emptyState = container.querySelector('.empty-state');
    if (_emptyState) _emptyState.remove();

    // ── Chart header + legend — created once ─────────────────────
    if (!container.querySelector('.graph-header')) {
      const header = document.createElement('div');
      header.className = 'graph-header';
      header.innerHTML =
        '<div class="graph-title-group">' +
          '<span class="graph-title">15-Year Outcome Projection</span>' +
          '<span class="graph-subtitle">Estimated clinical viability · Years 1–15</span>' +
        '</div>' +
        '<div class="graph-legend">' +
          '<span class="graph-legend-item"><span class="graph-legend-dot" style="background:var(--c-brand)"></span><span class="graph-legend-label">Implant</span></span>' +
          '<span class="graph-legend-item"><span class="graph-legend-dot" style="background:#f59e0b"></span><span class="graph-legend-label">Bridge</span></span>' +
          '<span class="graph-legend-item graph-legend-crown" style="display:none"><span class="graph-legend-dot" style="background:#3b82f6"></span><span class="graph-legend-label">Crown</span></span>' +
        '</div>';
      container.insertBefore(header, container.firstChild);
    }

    // Sync legend labels with active treatment options
    const _legendLabels = container.querySelectorAll('.graph-legend-label');
    if (_legendLabels.length >= 3) {
      const rl = ai.restorativeLabels;
      _legendLabels[0].textContent = rl?.slot1?.label || 'Implant';
      _legendLabels[1].textContent = rl?.slot2?.label || 'Bridge';
      _legendLabels[2].textContent = rl?.slot3?.label || 'Crown';
    }

    // ── Compute data points early — needed for height decision ───
    const Y_MIN = 50, Y_MAX = 100;
    const W = 320;
    const PAD_L = 42, PAD_R = 60, PAD_T = 16, PAD_B = 34;
    const years = Array.from({length: 15}, (_, i) => i + 1);
    const lastIdx = years.length - 1;
    if (!Number.isFinite(ai.implant) || !Number.isFinite(ai.bridge)) return;

    const implantPts = years.map(y => Math.max(65, ai.implant - (y * 0.35)));
    const bridgePts  = years.map(y => Math.max(55, ai.bridge  - (y * 0.85)));

    // Crown computed early — required for adaptive height and collision avoidance
    const isThreeOption = !!(ai.crownViable && ai.crown > 0);
    const crownPts = isThreeOption ? years.map(y => Math.max(58, ai.crown - (y * 0.55))) : null;

    // ── Adaptive height: 3-option mode gets 20px taller ─────────
    // Gives each curve ~18% more vertical breathing room (plotH 110 → 130)
    const H = isThreeOption ? 180 : 160;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    const sx = (i) => PAD_L + (i / lastIdx) * plotW;
    const sy = (v) => PAD_T + plotH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

    // ── Invalidate SVG when height mode or prior badge layout changes ─
    // Catches both 2-option↔3-option transitions and old badge-element SVGs
    let svg = container.querySelector('svg');
    if (svg && (svg.getAttribute('data-h') !== String(H) || svg.querySelector('.graph-rec-badge'))) {
      svg.remove(); svg = null;
    }

    // ── Create SVG structure once ────────────────────────────────
    if (!svg) {
      const NS = 'http://www.w3.org/2000/svg';
      const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
      };
      const LABEL_X = String(PAD_L + plotW + 5);

      svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, 'data-h': String(H) });
      svg.classList.add('graph-svg');
      container.appendChild(svg);

      // High-viability zone shading (≥80)
      const zY1 = sy(100), zY2 = sy(80);
      svg.appendChild(mk('rect', {
        x: PAD_L, y: zY1, width: plotW, height: zY2 - zY1,
        fill: 'rgba(31,122,79,0.05)', rx: '2'
      }));
      const zLbl = mk('text', {
        x: PAD_L + plotW - 2, y: zY1 + 9,
        'text-anchor': 'end', 'font-size': '7.5',
        fill: 'rgba(31,122,79,0.45)', 'font-family': 'inherit'
      });
      zLbl.textContent = 'High viability';
      svg.appendChild(zLbl);

      // Y-axis grid lines + numeric labels
      [[60, '60'], [75, '75'], [90, '90']].forEach(([val, lbl]) => {
        const gy = sy(val);
        svg.appendChild(mk('line', {
          x1: PAD_L, y1: gy, x2: PAD_L + plotW, y2: gy,
          stroke: 'var(--c-n200)', 'stroke-width': '0.5', 'stroke-dasharray': '3,3'
        }));
        const t = mk('text', {
          x: PAD_L - 5, y: gy + 3.5,
          'text-anchor': 'end', 'font-size': '8', fill: 'var(--c-n400)', 'font-family': 'inherit'
        });
        t.textContent = lbl;
        svg.appendChild(t);
      });

      // X-axis baseline
      svg.appendChild(mk('line', {
        x1: PAD_L, y1: PAD_T + plotH, x2: PAD_L + plotW, y2: PAD_T + plotH,
        stroke: 'var(--c-n200)', 'stroke-width': '0.5'
      }));

      // X-axis year labels at clinically meaningful milestones
      [[0, 'Yr 1'], [4, 'Yr 5'], [9, 'Yr 10'], [14, 'Yr 15']].forEach(([idx, lbl]) => {
        const tx = sx(idx);
        svg.appendChild(mk('line', {
          x1: tx, y1: PAD_T + plotH, x2: tx, y2: PAD_T + plotH + 3,
          stroke: 'var(--c-n300)', 'stroke-width': '0.5'
        }));
        const t = mk('text', {
          x: tx, y: PAD_T + plotH + 11,
          'text-anchor': 'middle', 'font-size': '8', fill: 'var(--c-n400)', 'font-family': 'inherit'
        });
        t.textContent = lbl;
        svg.appendChild(t);
      });

      // Data lines
      const iLine = mk('polyline', { fill: 'none', stroke: '#1F7A4F', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      iLine.classList.add('implant-line');
      svg.appendChild(iLine);

      const bLine = mk('polyline', { fill: 'none', stroke: '#f59e0b', 'stroke-width': '2', 'stroke-dasharray': '5,3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      bLine.classList.add('bridge-line');
      svg.appendChild(bLine);

      // Endpoint circles — x set at creation (constant per height mode)
      [['implant-start', '#1F7A4F', '3.5'], ['implant-end', '#1F7A4F', '3.5'],
       ['bridge-start',  '#f59e0b', '3.5'], ['bridge-end',  '#f59e0b', '3.5']].forEach(([cls, fill, r]) => {
        const c = mk('circle', { r, fill });
        c.classList.add(cls);
        svg.appendChild(c);
      });

      // Endpoint value labels — ★ suffix added dynamically for recommended option
      // x set at creation; y and textContent updated per render via collision avoidance
      const iLbl = mk('text', { x: LABEL_X, 'font-size': '9', 'font-weight': '700', fill: '#1F7A4F', 'font-family': 'inherit' });
      iLbl.classList.add('implant-end-label');
      svg.appendChild(iLbl);

      const bLbl = mk('text', { x: LABEL_X, 'font-size': '9', 'font-weight': '700', fill: '#f59e0b', 'font-family': 'inherit' });
      bLbl.classList.add('bridge-end-label');
      svg.appendChild(bLbl);

      // Crown elements
      const cLine = mk('polyline', { fill: 'none', stroke: '#3b82f6', 'stroke-width': '2', 'stroke-dasharray': '4,3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      cLine.classList.add('crown-line');
      svg.appendChild(cLine);
      const cEnd = mk('circle', { r: '3', fill: '#3b82f6' });
      cEnd.classList.add('crown-end');
      svg.appendChild(cEnd);
      const cLbl = mk('text', { x: LABEL_X, 'font-size': '9', 'font-weight': '700', fill: '#3b82f6', 'font-family': 'inherit' });
      cLbl.classList.add('crown-end-label');
      svg.appendChild(cLbl);
    }

    // ── Update line paths and start/end circles ──────────────────
    const ENDX = sx(lastIdx);
    const iEndY = sy(implantPts[lastIdx]);
    const bEndY = sy(bridgePts[lastIdx]);

    svg.querySelector('.implant-line').setAttribute('points', implantPts.map((v, i) => `${sx(i)},${sy(v)}`).join(' '));
    svg.querySelector('.bridge-line').setAttribute('points',  bridgePts.map((v, i) => `${sx(i)},${sy(v)}`).join(' '));

    svg.querySelector('.implant-start').setAttribute('cx', sx(0));
    svg.querySelector('.implant-start').setAttribute('cy', sy(implantPts[0]));
    svg.querySelector('.implant-end').setAttribute('cx', ENDX);
    svg.querySelector('.implant-end').setAttribute('cy', iEndY);
    svg.querySelector('.bridge-start').setAttribute('cx', sx(0));
    svg.querySelector('.bridge-start').setAttribute('cy', sy(bridgePts[0]));
    svg.querySelector('.bridge-end').setAttribute('cx', ENDX);
    svg.querySelector('.bridge-end').setAttribute('cy', bEndY);

    // ── Recommendation emphasis: thicker line + dimmed alternatives ──
    const rec = ai.rec || null;
    const iLineEl = svg.querySelector('.implant-line');
    const bLineEl = svg.querySelector('.bridge-line');

    if (rec === 'implant') {
      iLineEl.setAttribute('stroke-width', '3');   iLineEl.removeAttribute('stroke-opacity');
      bLineEl.setAttribute('stroke-width', '1.5'); bLineEl.setAttribute('stroke-opacity', '0.5');
    } else if (rec === 'bridge') {
      bLineEl.setAttribute('stroke-width', '3');   bLineEl.removeAttribute('stroke-opacity');
      iLineEl.setAttribute('stroke-width', '1.5'); iLineEl.setAttribute('stroke-opacity', '0.5');
    } else if (rec === 'crown') {
      iLineEl.setAttribute('stroke-width', '1.5'); iLineEl.setAttribute('stroke-opacity', '0.5');
      bLineEl.setAttribute('stroke-width', '1.5'); bLineEl.setAttribute('stroke-opacity', '0.5');
    } else {
      iLineEl.setAttribute('stroke-width', '2.5'); iLineEl.removeAttribute('stroke-opacity');
      bLineEl.setAttribute('stroke-width', '2');   bLineEl.removeAttribute('stroke-opacity');
    }

    // ── Crown line show/hide ──────────────────────────────────────
    const cLineEl = svg.querySelector('.crown-line');
    const cEndEl  = svg.querySelector('.crown-end');
    const cEndLbl = svg.querySelector('.crown-end-label');
    const cLegend = container.querySelector('.graph-legend-crown');
    let cEndY = null;

    if (isThreeOption) {
      cEndY = sy(crownPts[lastIdx]);
      cLineEl.setAttribute('points', crownPts.map((v, i) => `${sx(i)},${sy(v)}`).join(' '));
      cLineEl.style.display = ''; cEndEl.style.display = ''; cEndLbl.style.display = '';
      cEndEl.setAttribute('cx', ENDX); cEndEl.setAttribute('cy', cEndY);
      if (cLegend) cLegend.style.display = '';
      if (rec === 'crown') {
        cLineEl.setAttribute('stroke-width', '3'); cLineEl.removeAttribute('stroke-opacity');
      } else {
        cLineEl.setAttribute('stroke-width', '2'); cLineEl.setAttribute('stroke-opacity', '0.5');
      }
    } else {
      cLineEl.style.display = 'none'; cEndEl.style.display = 'none'; cEndLbl.style.display = 'none';
      if (cLegend) cLegend.style.display = 'none';
    }

    // ── Collision-aware endpoint label positioning ────────────────
    // Replaces the floating badge: ★ is inlined as a suffix on the recommended label.
    // This eliminates the 4th free-floating text node that caused crowding in 3-option mode.
    const lbEntries = [
      { el: svg.querySelector('.implant-end-label'), y: iEndY + 3.5, val: Math.round(implantPts[lastIdx]), isRec: rec === 'implant' },
      { el: svg.querySelector('.bridge-end-label'),  y: bEndY + 3.5, val: Math.round(bridgePts[lastIdx]),  isRec: rec === 'bridge' },
    ];
    if (cEndY !== null) {
      lbEntries.push({ el: cEndLbl, y: cEndY + 3.5, val: Math.round(crownPts[lastIdx]), isRec: rec === 'crown' });
    }

    // Sort top-to-bottom (lowest screen-y = highest on chart)
    lbEntries.sort((a, b) => a.y - b.y);

    // Greedy downward push: ensure minimum 11px between label baselines
    const MIN_LBL_GAP = 11;
    for (let i = 1; i < lbEntries.length; i++) {
      if (lbEntries[i].y - lbEntries[i - 1].y < MIN_LBL_GAP) {
        lbEntries[i].y = lbEntries[i - 1].y + MIN_LBL_GAP;
      }
    }

    // Apply: clamp at plot bottom, write textContent with ★ suffix for recommended
    const maxLblY = PAD_T + plotH + 2;
    lbEntries.forEach(({ el, y, val, isRec }) => {
      el.setAttribute('y', Math.min(y, maxLblY));
      el.textContent = isRec ? `${val}★` : String(val);
    });
  }
