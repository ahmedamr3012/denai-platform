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
      const checkupAnnual = 300;
      const s1_10yr = rc.slot1 ? Math.round(rc.slot1 + checkupAnnual * 10) : null;
      const s2_10yr = rc.slot2 ? Math.round(rc.slot2 + checkupAnnual * 10 + rc.slot2 * 0.15 * 0.8) : null;
      const s3_10yr = rc.slot3 ? Math.round(rc.slot3 + checkupAnnual * 10) : null;
      container.innerHTML = `
        <div class="cost-title"><i class="fa-solid fa-circle-dollar-to-slot" aria-hidden="true"></i> Restorative Cost Estimate</div>
        <div class="cost-row"><span>${escapeHtml(slot1.label)} — Initial</span><strong>$${rc.slot1 ? Math.round(rc.slot1).toLocaleString() : 'N/A'}</strong></div>
        <div class="cost-row"><span>${escapeHtml(slot2.label)} — Initial</span><strong>$${rc.slot2 ? Math.round(rc.slot2).toLocaleString() : 'N/A'}</strong></div>
        <div class="cost-row"><span>${escapeHtml(slot3.label)} — Initial</span><strong>$${rc.slot3 ? Math.round(rc.slot3).toLocaleString() : 'N/A'}</strong></div>
        ${s1_10yr ? `<div class="cost-row"><span>${escapeHtml(slot1.label)} 10‑yr total</span><strong>$${s1_10yr.toLocaleString()}</strong></div>` : ''}
        ${s2_10yr ? `<div class="cost-row"><span>${escapeHtml(slot2.label)} 10‑yr total</span><strong>$${s2_10yr.toLocaleString()}</strong></div>` : ''}
        ${s3_10yr ? `<div class="cost-row"><span>${escapeHtml(slot3.label)} 10‑yr total</span><strong>$${s3_10yr.toLocaleString()}</strong></div>` : ''}
        <div class="cost-best"><i class="fa-solid fa-star"></i> ${escapeHtml(slot1.label)} — lowest initial investment preserving natural tooth</div>
        <div style="font-size:9.5px;color:var(--c-n400);margin-top:6px;line-height:1.5;">* Based on entered cost inputs · Lab and clinical complexity may vary</div>
      `;
      return;
    }

    // ── Multi-tooth cost display ─────────────────────────────
    if (ai?.isMultiTooth) {
      const mtCosts = ai.costs;
      const ANNUAL_CHECKUP = 300;
      const imp2_10yr  = mtCosts.implant2   + ANNUAL_CHECKUP * 10;
      const bri4_10yr  = mtCosts.bridge4    + ANNUAL_CHECKUP * 10 + Math.round(mtCosts.bridge4 * 0.28 * 0.90);
      const cant_10yr  = mtCosts.cantilever + ANNUAL_CHECKUP * 10;
      const lowestCost = Math.min(imp2_10yr, bri4_10yr, cant_10yr);
      container.innerHTML = `
        <div class="cost-grid" style="display:grid;gap:10px">
          <div class="cost-row" style="font-weight:700;color:var(--c-n700);border-bottom:1px solid var(--c-n100);padding-bottom:8px">
            Multi-Tooth Cost Analysis — Teeth ${escapeHtml(state.tooth)} + ${escapeHtml(state.tooth2 || '')}
          </div>
          <div class="cost-row"><span>2 Implants initial</span><span style="font-weight:700">$${mtCosts.implant2.toLocaleString()}</span></div>
          <div class="cost-row"><span>4-Unit Bridge initial</span><span style="font-weight:700">$${mtCosts.bridge4.toLocaleString()}</span></div>
          <div class="cost-row"><span>Implant + Cantilever</span><span style="font-weight:700">$${mtCosts.cantilever.toLocaleString()}</span></div>
          <div style="border-top:1px solid var(--c-n100);padding-top:8px;display:flex;flex-direction:column;gap:6px">
            <div class="cost-row${imp2_10yr === lowestCost ? ' cost-best' : ''}"><span>2 Implants 10-yr</span><span style="font-weight:700;color:${imp2_10yr===lowestCost?'var(--c-brand)':'var(--c-n700)'}">$${imp2_10yr.toLocaleString()}${imp2_10yr===lowestCost?' ✓':''}</span></div>
            <div class="cost-row${bri4_10yr === lowestCost ? ' cost-best' : ''}"><span>Bridge 4-unit 10-yr</span><span style="font-weight:700;color:${bri4_10yr===lowestCost?'var(--c-brand)':'var(--c-n700)'}">$${bri4_10yr.toLocaleString()}${bri4_10yr===lowestCost?' ✓':''}</span></div>
            <div class="cost-row${cant_10yr === lowestCost ? ' cost-best' : ''}"><span>Cantilever 10-yr</span><span style="font-weight:700;color:${cant_10yr===lowestCost?'var(--c-brand)':'var(--c-n700)'}">$${cant_10yr.toLocaleString()}${cant_10yr===lowestCost?' ✓':''}</span></div>
          </div>
          <div style="padding:10px 12px;background:var(--c-brand-bg);border-radius:var(--r-md);border:1.5px solid rgba(31,122,79,.2);font-size:12px;color:var(--c-brand);font-weight:600">
            ★ Lowest 10-yr cost: ${bri4_10yr < imp2_10yr && bri4_10yr < cant_10yr ? '4-Unit Bridge ($' + bri4_10yr.toLocaleString() + ')' : imp2_10yr < cant_10yr ? '2 Implants ($' + imp2_10yr.toLocaleString() + ')' : 'Cantilever ($' + cant_10yr.toLocaleString() + ')'}
          </div>
        </div>`;
      return;
    }

    const { implantInitial, bridgeInitialAdjusted, implant10yr, bridge10yr, bestValue, reason } = computeCosts(state, ai);
    const bridgeReplacement = Math.round(bridgeInitialAdjusted * BRIDGE_REPLACE_RATIO);
    const boneLine = state.bone === 'Poor'
      ? `<div class="cost-row" style="color:var(--c-n500);font-size:12px;"><span>↳ incl. bone graft</span><strong>+$${(state.costBoneGraft||800).toLocaleString()}</strong></div>` : '';

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
        ${riskCostRows.map(r => `<div class="cost-row" style="font-size:12px;"><span>${escapeHtml(r.label)}</span><strong style="color:#dc2626;">~$${r.cost.toLocaleString()}</strong></div>`).join('')}
      </div>` : '';

    const checkupTotal = ANNUAL_CHECKUP * 10;
    const implantCrownRisk = Math.round(implantInitial * CROWN_COST_RATIO * CROWN_REPLACE_PROB);
    const bridgeReplaceRisk = Math.round(bridgeInitialAdjusted * BRIDGE_REPLACE_PROB * BRIDGE_REPLACE_RATIO);

    const { crownInitial, needsRCT, needsPostCore, crown10yr } = computeCosts(state, ai);
    const crownLine = ai?.crownViable
      ? `<div class="cost-row"><span>Crown initial <span style="font-size:10px;">${needsRCT ? '(+RCT $1,000) ' : ''}${needsPostCore ? '(+Post&amp;Core $400)' : ''}</span></span><strong>$${Math.round(crownInitial).toLocaleString()}</strong></div>` : '';
    const crown10yrLine = ai?.crownViable
      ? `<div class="cost-row" style="font-weight:700;"><span>Crown 10‑yr total</span><strong style="color:var(--c-brand);">$${Math.round(crown10yr).toLocaleString()}</strong></div>` : '';
    const crownReplaceRisk = ai?.crownViable ? Math.round(crownInitial * STANDALONE_CROWN_REPLACE_PROB * STANDALONE_CROWN_REPLACE_RATIO) : 0;

    container.innerHTML = `
      <div class="cost-row"><span>Implant initial</span><strong>$${implantInitial.toLocaleString()}</strong></div>
      ${boneLine}
      <div class="cost-row"><span>Bridge initial</span><strong>$${Math.round(bridgeInitialAdjusted).toLocaleString()}</strong></div>
      ${crownLine}
      <div class="cost-row" style="border-top:1px solid var(--c-n100); padding-top:8px; margin-top:4px; font-size:11.5px; color:var(--c-n500);">
        <span>Checkups (all) <span style="font-size:10px;">2×/yr × $150 × 10yr</span></span>
        <span>$${checkupTotal.toLocaleString()}</span>
      </div>
      <div class="cost-row" style="font-size:11.5px; color:var(--c-n500);">
        <span>Implant crown replacement risk <span style="font-size:10px;">~12% prob.</span></span>
        <span>~$${implantCrownRisk.toLocaleString()}</span>
      </div>
      <div class="cost-row" style="font-size:11.5px; color:var(--c-n500);">
        <span>Bridge replacement risk <span style="font-size:10px;">~28% prob.</span></span>
        <span>~$${bridgeReplaceRisk.toLocaleString()}</span>
      </div>
      ${ai?.crownViable ? `<div class="cost-row" style="font-size:11.5px; color:var(--c-n500);"><span>Crown replacement risk <span style="font-size:10px;">~15% prob.</span></span><span>~$${crownReplaceRisk.toLocaleString()}</span></div>` : ''}
      <div class="cost-row" style="border-top:1px solid var(--c-n100); padding-top:8px; margin-top:4px; font-weight:700;">
        <span>Implant 10‑yr total</span>
        <strong>$${Math.round(implant10yr).toLocaleString()}</strong>
      </div>
      <div class="cost-row" style="font-weight:700;">
        <span>Bridge 10‑yr total</span>
        <strong>$${Math.round(bridge10yr).toLocaleString()}</strong>
      </div>
      ${crown10yrLine}
      <div class="cost-best"><i class="fa-solid fa-star"></i> Best Overall Value: ${bestValue}</div>
      <div style="font-size:10px; color:var(--c-n500); margin-top:4px;">${reason}</div>
      <div style="font-size:9.5px; color:var(--c-n400); margin-top:6px; line-height:1.5;">* Bridge wins at 10 yrs on cost — Implant wins long-term (20+ yrs, no full replacement needed)</div>
      ${riskMitigationHtml}
    `;
  }

  // ================================================================
  // RENDER: GRAPH (SVG) — OPTIMIZED
  // ================================================================
  function renderGraph(ai) {
    const container = $('graphContainer');
    if (!container) return;
    if (!ai) {
      container.innerHTML = '<div class="empty-state" style="padding:14px;"><i class="fa-solid fa-chart-line" aria-hidden="true" style="font-size:24px;color:var(--c-brand);"></i><h4 style="font-size:14px;margin-top:8px;color:var(--c-n800);">No Projection Data</h4><p style="font-size:11px;color:var(--c-n500);margin-top:4px;">Complete patient profile to see success projection.</p></div>';
      return;
    }
    if (ai?.isMultiTooth) return;
    if (ai?.treatmentMode === 'restorative') return;
    // PERF#2: remove empty-state without wiping SVG
    const _emptyState = container.querySelector('.empty-state');
    if (_emptyState) _emptyState.remove();

    const width = 300, height = 120, padding = 30;
    const years = Array.from({length: 15}, (_,i) => i+1);
    const lastIndex = years.length - 1;
    const implantPoints = years.map(y => Math.max(65, ai.implant - (y * 0.35)));
    const bridgePoints = years.map(y => Math.max(55, ai.bridge - (y * 0.85)));
    const scaleX = (i) => padding + (i / lastIndex) * (width - 2 * padding);
    const scaleY = (v) => height - padding - (v / 100) * (height - 2 * padding);

    let svg = container.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.classList.add('graph-svg');
      container.appendChild(svg);

      for (let i = 0; i <= 4; i++) {
        const y = padding + (i / 4) * (height - 2 * padding);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding); line.setAttribute('y1', y);
        line.setAttribute('x2', width - padding); line.setAttribute('y2', y);
        line.setAttribute('stroke', 'var(--c-n200)');
        line.setAttribute('stroke-width', '0.5');
        svg.appendChild(line);
      }

      const implantLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      implantLine.classList.add('implant-line');
      implantLine.setAttribute('fill', 'none');
      implantLine.setAttribute('stroke', '#1F7A4F');
      implantLine.setAttribute('stroke-width', '2.5');
      svg.appendChild(implantLine);

      const bridgeLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      bridgeLine.classList.add('bridge-line');
      bridgeLine.setAttribute('fill', 'none');
      bridgeLine.setAttribute('stroke', '#f59e0b');
      bridgeLine.setAttribute('stroke-width', '2.5');
      bridgeLine.setAttribute('stroke-dasharray', '5,3');
      svg.appendChild(bridgeLine);

      const implantStart = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      implantStart.classList.add('implant-start'); implantStart.setAttribute('r', '3.5'); implantStart.setAttribute('fill', '#1F7A4F');
      svg.appendChild(implantStart);
      const implantEnd = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      implantEnd.classList.add('implant-end'); implantEnd.setAttribute('r', '3.5'); implantEnd.setAttribute('fill', '#1F7A4F');
      svg.appendChild(implantEnd);
      const bridgeStart = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bridgeStart.classList.add('bridge-start'); bridgeStart.setAttribute('r', '3.5'); bridgeStart.setAttribute('fill', '#f59e0b');
      svg.appendChild(bridgeStart);
      const bridgeEnd = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bridgeEnd.classList.add('bridge-end'); bridgeEnd.setAttribute('r', '3.5'); bridgeEnd.setAttribute('fill', '#f59e0b');
      svg.appendChild(bridgeEnd);

      const implantLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      implantLabel.classList.add('implant-label'); implantLabel.setAttribute('fill', '#1F7A4F'); implantLabel.setAttribute('font-size', '9'); implantLabel.setAttribute('font-weight', '700'); implantLabel.textContent = 'Implant';
      svg.appendChild(implantLabel);
      const bridgeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bridgeLabel.classList.add('bridge-label'); bridgeLabel.setAttribute('fill', '#f59e0b'); bridgeLabel.setAttribute('font-size', '9'); bridgeLabel.setAttribute('font-weight', '700'); bridgeLabel.textContent = 'Bridge';
      svg.appendChild(bridgeLabel);

      // Crown line elements
      const crownLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      crownLine.classList.add('crown-line'); crownLine.setAttribute('fill','none'); crownLine.setAttribute('stroke','#3b82f6'); crownLine.setAttribute('stroke-width','2'); crownLine.setAttribute('stroke-dasharray','4,3');
      svg.appendChild(crownLine);
      const crownEnd = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      crownEnd.classList.add('crown-end'); crownEnd.setAttribute('r','3'); crownEnd.setAttribute('fill','#3b82f6');
      svg.appendChild(crownEnd);
      const crownLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      crownLabel.classList.add('crown-label'); crownLabel.setAttribute('fill','#3b82f6'); crownLabel.setAttribute('font-size','9'); crownLabel.setAttribute('font-weight','700'); crownLabel.textContent = 'Crown';
      svg.appendChild(crownLabel);
    }

    svg.querySelector('.implant-line').setAttribute('points', implantPoints.map((v,i) => `${scaleX(i)},${scaleY(v)}`).join(' '));
    svg.querySelector('.bridge-line').setAttribute('points', bridgePoints.map((v,i) => `${scaleX(i)},${scaleY(v)}`).join(' '));
    svg.querySelector('.implant-start').setAttribute('cx', scaleX(0));
    svg.querySelector('.implant-start').setAttribute('cy', scaleY(implantPoints[0]));
    svg.querySelector('.implant-end').setAttribute('cx', scaleX(lastIndex));
    svg.querySelector('.implant-end').setAttribute('cy', scaleY(implantPoints[lastIndex]));
    svg.querySelector('.bridge-start').setAttribute('cx', scaleX(0));
    svg.querySelector('.bridge-start').setAttribute('cy', scaleY(bridgePoints[0]));
    svg.querySelector('.bridge-end').setAttribute('cx', scaleX(lastIndex));
    svg.querySelector('.bridge-end').setAttribute('cy', scaleY(bridgePoints[lastIndex]));
    // Update line labels based on mode
    const implantLabelEl = svg.querySelector('.implant-label');
    const bridgeLabelEl  = svg.querySelector('.bridge-label');
    const crownLabelEl   = svg.querySelector('.crown-label');
    if (ai.treatmentMode === 'restorative' && ai.restorativeLabels) {
      if (implantLabelEl) implantLabelEl.textContent = ai.restorativeLabels.slot1.label.split(' ')[0];
      if (bridgeLabelEl)  bridgeLabelEl.textContent  = ai.restorativeLabels.slot2.label.split(' ')[0];
      if (crownLabelEl)   crownLabelEl.textContent   = ai.restorativeLabels.slot3.label.split(' ')[0];
    } else if (ai.isMultiTooth) {
      if (implantLabelEl) implantLabelEl.textContent = '2 Impl.';
      if (bridgeLabelEl)  bridgeLabelEl.textContent  = '4-Unit';
      if (crownLabelEl)   crownLabelEl.textContent   = 'Cantilever';
    } else {
      if (implantLabelEl) implantLabelEl.textContent = 'Implant';
      if (bridgeLabelEl)  bridgeLabelEl.textContent  = 'Bridge';
      if (crownLabelEl)   crownLabelEl.textContent   = 'Crown';
    }
    // Crown line update — reuse crownLabelEl from label-update block above
    const crownLineEl = svg.querySelector('.crown-line');
    const crownEndEl  = svg.querySelector('.crown-end');
    if (ai.crownViable && ai.crown > 0) {
      const crownPoints = years.map(y => Math.max(58, ai.crown - (y * 0.55)));
      crownLineEl.setAttribute('points', crownPoints.map((v,i) => `${scaleX(i)},${scaleY(v)}`).join(' '));
      crownLineEl.style.display = ''; crownEndEl.style.display = ''; crownLabelEl.style.display = '';
      crownEndEl.setAttribute('cx', scaleX(lastIndex));
      crownEndEl.setAttribute('cy', scaleY(crownPoints[lastIndex]));
      crownLabelEl.setAttribute('x', scaleX(lastIndex - 2));
      crownLabelEl.setAttribute('y', scaleY(crownPoints[lastIndex]) + 14);
    } else {
      crownLineEl.style.display = 'none'; crownEndEl.style.display = 'none'; crownLabelEl.style.display = 'none';
    }
  }
