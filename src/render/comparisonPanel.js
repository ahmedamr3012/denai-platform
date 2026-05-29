  // ================================================================
  // RENDER: COMPARISON
  // ================================================================
  function renderComparison(state, ai) {
    // ── MULTI-TOOTH ROUTING ──────────────────────────────────────────────
    if (ai?.isMultiTooth) {
      const cImp = $('cImplantSuc'), cBri = $('cBridgeSuc'), cCrn = $('cCrownSuc');
      if (cImp) cImp.textContent = ai.implant2.toFixed(1) + '%';
      if (cBri) cBri.textContent = ai.bridge4.toFixed(1)  + '%';
      if (cCrn) cCrn.textContent = ai.cantilever.toFixed(1) + '%';

      const cImpRisk = $('cImplantRisk'), cBriRisk = $('cBridgeRisk'), cCrnRisk = $('cCrownRisk');
      if (cImpRisk) cImpRisk.textContent = ai.conf >= 75 ? 'Low–Med' : 'Medium';
      if (cBriRisk) cBriRisk.textContent = ai.abutmentCompromised ? 'High' : 'Medium';
      if (cCrnRisk) cCrnRisk.textContent = ai.posterior ? 'High' : 'Medium';

      const cImpRec = $('cImplantRec'), cBriRec = $('cBridgeRec'), cCrnRec = $('cCrownRec');
      if (cImpRec) cImpRec.textContent = '3–6 months';
      if (cBriRec) cBriRec.textContent = '3–5 weeks';
      if (cCrnRec) cCrnRec.textContent = 'N/A';

      const cImpLong = $('cImplantLong'), cBriLong = $('cBridgeLong'), cCrnLong = $('cCrownLong');
      if (cImpLong) cImpLong.textContent = '20–25 yrs';
      if (cBriLong) cBriLong.textContent = '10–15 yrs';
      if (cCrnLong) cCrnLong.textContent = 'N/A';

      const cImpMR = $('cImplantMR'), cBriMR = $('cBridgeMR'), cCrnMR = $('cCrownMR');
      if (cImpMR) cImpMR.textContent = 'Peri-implantitis';
      if (cBriMR) cBriMR.textContent = 'Abutment stress';
      if (cCrnMR) cCrnMR.textContent = 'N/A';

      const isImp2 = state.tx === 'implant2' || state.tx === 'implant';
      const isBri4 = state.tx === 'bridge4'  || state.tx === 'bridge';
      const isCant = state.tx === 'cantilever' || state.tx === 'crown';
      ['cImplantLong','cImplantSuc','cImplantRisk','cImplantMR','cImplantRec'].forEach(id => {
        const el = $(id); if (el) { el.classList.toggle('dimmed', !isImp2); el.classList.toggle('hi', isImp2); }
      });
      ['cBridgeLong','cBridgeSuc','cBridgeRisk','cBridgeMR','cBridgeRec'].forEach(id => {
        const el = $(id); if (el) { el.classList.toggle('dimmed', !isBri4); el.classList.toggle('hi', isBri4); }
      });
      ['cCrownLong','cCrownSuc','cCrownRisk','cCrownMR','cCrownRec'].forEach(id => {
        const el = $(id); if (el) { el.classList.toggle('dimmed', !isCant); el.classList.toggle('hi', isCant); }
      });
      return;
    }

    // ── RESTORATIVE ROUTING ───────────────────────────────────────────────
    if (ai?.treatmentMode === 'restorative' && ai.restorativeLabels) {
      const { slot1, slot2, slot3 } = ai.restorativeLabels;
      const bySlot = {};
      (ai.scored || []).forEach(t => { bySlot[t.slot] = t; });

      // Update inline column headers to match actual treatment labels
      const inlineHeads = document.querySelectorAll('#compInlineTable .comp-head-cell');
      if (inlineHeads[1]) inlineHeads[1].textContent = slot1.label;
      if (inlineHeads[2]) inlineHeads[2].textContent = slot2.label;
      if (inlineHeads[3]) inlineHeads[3].textContent = slot3.label;

      const cImpSuc = $('cImplantSuc'), cBriSuc = $('cBridgeSuc'), cCrnSuc = $('cCrownSuc');
      if (cImpSuc) cImpSuc.textContent = ai.implant.toFixed(1) + '%';
      if (cBriSuc) cBriSuc.textContent = ai.bridge.toFixed(1)  + '%';
      if (cCrnSuc) cCrnSuc.textContent = ai.crown.toFixed(1)   + '%';

      // Longevity by treatment type
      const LONGEVITY = {
        onlay: '10–15 yrs', crown: '10–20 yrs', crown_core: '10–18 yrs',
        crown_adv: '10–18 yrs', splinted: '10–18 yrs',
        endocrown: '10–15 yrs', extract_impl: '20–25 yrs'
      };
      const MAIN_RISK = {
        onlay: 'Marginal fracture', crown: 'Secondary caries', crown_core: 'Root fracture risk',
        crown_adv: 'Secondary caries', splinted: 'Perio access', endocrown: 'Cusp fracture',
        extract_impl: 'Peri-implantitis'
      };
      const RECOVERY = {
        onlay: '1–2 weeks', crown: '1–2 wks', crown_core: '2–3 wks',
        crown_adv: '1–2 wks', splinted: '2–3 wks', endocrown: '1–2 wks',
        extract_impl: '4–6 months'
      };
      const s1 = bySlot['implant'], s2 = bySlot['bridge'], s3 = bySlot['crown'];
      const cImpLong = $('cImplantLong'), cBriLong = $('cBridgeLong'), cCrnLong = $('cCrownLong');
      if (cImpLong) cImpLong.textContent = LONGEVITY[s1?.id] || '10–18 yrs';
      if (cBriLong) cBriLong.textContent = LONGEVITY[s2?.id] || '10–20 yrs';
      if (cCrnLong) cCrnLong.textContent = LONGEVITY[s3?.id] || '10–15 yrs';

      const cImpRisk = $('cImplantRisk'), cBriRisk = $('cBridgeRisk'), cCrnRisk = $('cCrownRisk');
      const riskFor = (opt) => opt?.score >= 90 ? 'Low' : opt?.score >= 80 ? 'Medium' : 'Med–High';
      if (cImpRisk) cImpRisk.textContent = riskFor(s1);
      if (cBriRisk) cBriRisk.textContent = riskFor(s2);
      if (cCrnRisk) cCrnRisk.textContent = riskFor(s3);

      const cImpMR = $('cImplantMR'), cBriMR = $('cBridgeMR'), cCrnMR = $('cCrownMR');
      if (cImpMR) cImpMR.textContent = MAIN_RISK[s1?.id] || '—';
      if (cBriMR) cBriMR.textContent = MAIN_RISK[s2?.id] || '—';
      if (cCrnMR) cCrnMR.textContent = MAIN_RISK[s3?.id] || '—';

      const cImpRec = $('cImplantRec'), cBriRec = $('cBridgeRec'), cCrnRec = $('cCrownRec');
      if (cImpRec) cImpRec.textContent = RECOVERY[s1?.id] || '1–2 wks';
      if (cBriRec) cBriRec.textContent = RECOVERY[s2?.id] || '1–2 wks';
      if (cCrnRec) cCrnRec.textContent = RECOVERY[s3?.id] || '1–2 wks';

      // Highlight active selection
      const isSlot1 = state.tx === 'implant', isSlot2 = state.tx === 'bridge', isSlot3 = state.tx === 'crown';
      ['cImplantLong','cImplantSuc','cImplantRisk','cImplantMR','cImplantRec'].forEach(id => {
        const el = $(id); if (el) { el.classList.toggle('dimmed', !isSlot1); el.classList.toggle('hi', isSlot1); }
      });
      ['cBridgeLong','cBridgeSuc','cBridgeRisk','cBridgeMR','cBridgeRec'].forEach(id => {
        const el = $(id); if (el) { el.classList.toggle('dimmed', !isSlot2); el.classList.toggle('hi', isSlot2); }
      });
      ['cCrownLong','cCrownSuc','cCrownRisk','cCrownMR','cCrownRec'].forEach(id => {
        const el = $(id); if (el) { el.classList.toggle('dimmed', !isSlot3); el.classList.toggle('hi', isSlot3); }
      });
      return;
    }

    // ── SINGLE-TOOTH PATH ────────────────────────────────────────────────
    // Restore inline column headers to standard labels (may have been changed by restorative path)
    const inlineHeads = document.querySelectorAll('#compInlineTable .comp-head-cell');
    if (inlineHeads[1] && inlineHeads[1].textContent !== 'Implant') inlineHeads[1].textContent = 'Implant';
    if (inlineHeads[2] && inlineHeads[2].textContent !== 'Bridge')  inlineHeads[2].textContent = 'Bridge';
    if (inlineHeads[3] && inlineHeads[3].textContent !== 'Crown')   inlineHeads[3].textContent = 'Crown';

    const isImp = state.tx === 'implant';
    const isBri = state.tx === 'bridge';
    const isCrn = state.tx === 'crown';
    const crownViable = ai?.crownViable === true;
    if (ai) {
      const cImpSuc = $('cImplantSuc'), cBriSuc = $('cBridgeSuc'), cCrnSuc = $('cCrownSuc');
      if (cImpSuc) cImpSuc.textContent = ai.implant.toFixed(1) + '%';
      if (cBriSuc) cBriSuc.textContent = ai.bridge.toFixed(1)  + '%';
      if (cCrnSuc) cCrnSuc.textContent = crownViable ? ai.crown.toFixed(1) + '%' : 'N/A';

      const cImpRisk = $('cImplantRisk'), cBriRisk = $('cBridgeRisk'), cCrnRisk = $('cCrownRisk');
      if (cImpRisk) cImpRisk.textContent = (ai.boneR==='High'||ai.peri==='High') ? 'Med‑High' : 'Low';
      const bridgeRiskLevel = (state.hygiene==='Poor'||state.bone==='Poor') ? 'Med‑High' : (state.hygiene==='Good'&&state.bone==='Good') ? 'Low' : 'Medium';
      if (cBriRisk) cBriRisk.textContent = bridgeRiskLevel;
      if (cCrnRisk) {
        if (crownViable && ai.crownRisks) {
          const cr = ai.crownRisks;
          cCrnRisk.textContent = (cr.crownFracture==='High'||cr.rootFracture==='High') ? 'High' : (cr.crownFracture==='Medium'||cr.secondaryCaries==='Medium') ? 'Medium' : 'Low';
        } else { cCrnRisk.textContent = 'N/A'; }
      }
      const needsRCT = state.endodonticStatus === 'Needs RCT';
      const cCrnRec  = $('cCrownRec'),  cCrnLong = $('cCrownLong'), cCrnMR = $('cCrownMR');
      if (cCrnRec)  cCrnRec.textContent  = crownViable ? (needsRCT ? '3‑4 wks' : '1‑2 wks ✓') : 'N/A';
      if (cCrnLong) cCrnLong.textContent = crownViable ? '10‑20 yrs' : 'N/A';
      if (cCrnMR)   cCrnMR.textContent   = crownViable ? 'Secondary caries' : 'N/A';
    } else {
      ['cImplantLong','cBridgeLong','cCrownLong','cImplantSuc','cBridgeSuc','cCrownSuc','cImplantRisk','cBridgeRisk','cCrownRisk','cImplantMR','cBridgeMR','cCrownMR','cImplantRec','cBridgeRec','cCrownRec'].forEach(id => {
        const el = $(id); if (el) { el.textContent = '—'; el.classList.remove('hi','dimmed'); }
      });
      return;
    }
    const HI_IMPLANT = ['cImplantLong','cImplantSuc','cImplantRisk'];
    const HI_BRIDGE  = ['cBridgeLong','cBridgeSuc','cBridgeRisk'];
    const HI_CROWN   = ['cCrownLong','cCrownSuc','cCrownRisk'];
    ['cImplantLong','cImplantSuc','cImplantRisk','cImplantMR','cImplantRec'].forEach(id => {
      const el = $(id); if(el){el.classList.toggle('dimmed',!isImp);el.classList.toggle('hi',isImp&&HI_IMPLANT.includes(id));}
    });
    ['cBridgeLong','cBridgeSuc','cBridgeRisk','cBridgeMR','cBridgeRec'].forEach(id => {
      const el = $(id); if(el){el.classList.toggle('dimmed',!isBri);el.classList.toggle('hi',isBri&&HI_BRIDGE.includes(id));}
    });
    ['cCrownLong','cCrownSuc','cCrownRisk','cCrownMR','cCrownRec'].forEach(id => {
      const el = $(id); if(el){el.classList.toggle('dimmed',!isCrn||!crownViable);el.classList.toggle('hi',isCrn&&crownViable&&HI_CROWN.includes(id));}
    });
  }

  // ── #20 Lazy: comparison table renders only when visible ────
  let _compTableObserver = null;
  function lazyRenderComparisonTable(state, ai) {
    const wrapper = document.querySelector('.comparison-table-wrap') || $('comparisonTableBody')?.closest('.card-body');
    if (!wrapper) { renderComparisonTable(state, ai); return; }
    // Disconnect any pending observer from a previous render cycle
    if (_compTableObserver) { _compTableObserver.disconnect(); _compTableObserver = null; }
    // Render synchronously when already visible — prevents stale data during mode
    // transitions. The IntersectionObserver fires asynchronously even for already-visible
    // elements (~1 frame delay), which is long enough for users to read old content.
    const rect = wrapper.getBoundingClientRect();
    const alreadyVisible = rect.top < (window.innerHeight || 900) && rect.bottom > 0;
    if (alreadyVisible) {
      renderComparisonTable(state, ai);
      return;
    }
    // Lazy render for off-screen elements — only create observer when element is hidden
    _compTableObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        renderComparisonTable(state, ai);
        _compTableObserver?.disconnect();
        _compTableObserver = null;
      }
    }, { threshold: 0.1 });
    _compTableObserver.observe(wrapper);
  }

  function renderComparisonTable(state, ai) {
    const tbody = $('comparisonTableBody');
    if (!tbody) return;

    // Deterministic header reset — every render starts with neutral labels.
    // Prevents headers set by a previous mode (e.g. '2 Implants' from multi-tooth)
    // from persisting when switching to single-tooth or restorative mode.
    const impH = $('compImplantHead'), briH = $('compBridgeHead'), crnH = $('compCrownHead');
    if (impH) { impH.textContent = 'Implant'; impH.className = ''; }
    if (briH) { briH.textContent = 'Bridge';  briH.className = ''; }
    if (crnH) { crnH.textContent = 'Crown';   crnH.className = ''; }

    if (!ai) { tbody.innerHTML = `<tr><td colspan="4"><div class="comp-empty-state"><i class="fa-solid fa-stethoscope" aria-hidden="true"></i>Complete patient &amp; clinical data above to generate the full treatment comparison</div></td></tr>`; return; }

    // ── RESTORATIVE TABLE ──────────────────────────────────────────────
    if (ai.treatmentMode === 'restorative' && ai.scored && ai.restorativeLabels) {
      const { slot1, slot2, slot3 } = ai.restorativeLabels;
      const bySlot = {};
      ai.scored.forEach(t => { bySlot[t.slot] = t; });
      const s1 = bySlot['implant'], s2 = bySlot['bridge'], s3 = bySlot['crown'];
      const rc = ai.restorativeCosts || {};
      const bestScore = Math.max(ai.implant, ai.bridge, ai.crown);

      const impHead = $('compImplantHead'), briHead = $('compBridgeHead'), crnHead = $('compCrownHead');
      if (impHead) { impHead.textContent = slot1.label; impHead.className = ai.rec === 'implant' ? 'comp-winner-col' : ''; }
      if (briHead) { briHead.textContent = slot2.label; briHead.className = ai.rec === 'bridge'  ? 'comp-winner-col' : ''; }
      if (crnHead) { crnHead.textContent = slot3.label; crnHead.className = ai.rec === 'crown'   ? 'comp-winner-col' : ''; }

      const badge = (slotKey) => ai.rec === slotKey ? '<span class="comp-badge">✓ Rec</span>' : '';
      const scoreBadge = (sc) => sc === bestScore ? '<span class="comp-badge">✓ Best</span>' : '';
      const LONGEVITY = { onlay:'8–15 yrs', crown:'10–20 yrs', crown_core:'10–18 yrs', crown_adv:'10–18 yrs', splinted:'10–18 yrs', endocrown:'10–15 yrs', extract_impl:'20–25 yrs' };
      const TOOTH_PRES = { onlay:'Yes — minimal prep', crown:'Preserved ✓', crown_core:'Preserved ✓', crown_adv:'Preserved ✓', splinted:'Preserved ✓', endocrown:'Preserved ✓', extract_impl:'No — extraction' };
      const RECOVERY   = { onlay:'1–2 weeks', crown:'1–2 weeks', crown_core:'2–3 weeks', crown_adv:'1–2 weeks', splinted:'2–3 weeks', endocrown:'1–2 weeks', extract_impl:'4–6 months' };
      const MAIN_RISK  = { onlay:'Marginal fracture', crown:'Secondary caries', crown_core:'Root fracture', crown_adv:'Secondary caries', splinted:'Perio access / plaque', endocrown:'Cusp fracture', extract_impl:'Peri-implantitis' };

      const rows = [
        ['Suitability',
          `${ai.implant.toFixed(1)}${scoreBadge(ai.implant)}`,
          `${ai.bridge.toFixed(1)}${scoreBadge(ai.bridge)}`,
          `${ai.crown.toFixed(1)}${scoreBadge(ai.crown)}`,
          ai.implant === bestScore],
        ['Initial Cost',
          rc.slot1 ? `${formatCurrency(rc.slot1)}<span class="comp-badge">✓ Lowest</span>` : '—',
          rc.slot2 ? `${formatCurrency(rc.slot2)}` : '—',
          rc.slot3 ? `${formatCurrency(rc.slot3)}` : '—',
          true],
        ['Longevity', LONGEVITY[s1?.id]||'—', LONGEVITY[s2?.id]||'—', LONGEVITY[s3?.id]||'—',
          (s3?.id === 'extract_impl')],
        ['Tooth Preserved', TOOTH_PRES[s1?.id]||'—', TOOTH_PRES[s2?.id]||'—', TOOTH_PRES[s3?.id]||'—',
          s1?.id !== 'extract_impl'],
        ['Recovery', RECOVERY[s1?.id]||'—', RECOVERY[s2?.id]||'—', RECOVERY[s3?.id]||'—', true],
        ['Main Risk', MAIN_RISK[s1?.id]||'—', MAIN_RISK[s2?.id]||'—', MAIN_RISK[s3?.id]||'—', false],
        ['AI Recommendation',
          `${slot1.label}${badge('implant')}`,
          `${slot2.label}${badge('bridge')}`,
          `${slot3.label}${badge('crown')}`,
          ai.rec === 'implant'],
      ];
      tbody.innerHTML = rows.map(([label, c1, c2, c3, firstBetter]) => `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td class="${firstBetter?'winner':'loser'} ${ai.rec==='implant'?'comp-winner-col':''}">${c1}</td>
          <td class="${!firstBetter?'winner':'loser'} ${ai.rec==='bridge'?'comp-winner-col':''}">${c2}</td>
          <td class="${ai.rec==='crown'?'winner comp-winner-col':''}">${c3}</td>
        </tr>`).join('');
      return;
    }

    // ── MULTI-TOOTH TABLE ──────────────────────────────────────────────
    if (ai.isMultiTooth) {
      const { implant2, bridge4, cantilever, costs, rec, ideal } = ai;
      const lowestScore = Math.max(implant2, bridge4, cantilever);
      const impBest = implant2 === lowestScore, briBest = bridge4 === lowestScore, cntBest = cantilever === lowestScore;

      const impHead = $('compImplantHead'), briHead = $('compBridgeHead'), crnHead = $('compCrownHead');
      if (impHead) { impHead.textContent = '2 Implants';       impHead.className = rec==='implant2'   ? 'comp-winner-col' : ''; }
      if (briHead) { briHead.textContent = '4-Unit Bridge';    briHead.className = rec==='bridge4'    ? 'comp-winner-col' : ''; }
      if (crnHead) { crnHead.textContent = 'Impl. + Cantilever'; crnHead.className = rec==='cantilever' ? 'comp-winner-col' : ''; }

      const badge = (flag) => flag ? '<span class="comp-badge">✓ Best</span>' : '';
      const recBadge = (opt) => rec === opt ? '<span class="comp-badge">✓ Rec</span>' : (ideal === opt ? '<span class="comp-badge">✦ Ideal</span>' : '');
      const rows = [
        ['Suitability',    `${implant2.toFixed(1)}${badge(impBest)}`,   `${bridge4.toFixed(1)}${badge(briBest)}`,  `${cantilever.toFixed(1)}${badge(cntBest)}`,  impBest],
        ['Initial Cost',    `${formatCurrency(costs.implant2)}`,        `${formatCurrency(costs.bridge4)}`,        `${formatCurrency(costs.cantilever)}`,        false],
        ['Longevity',       '20–25 yrs<span class="comp-badge">✓</span>', '10–15 yrs',                                '15–20 yrs',                                    true],
        ['Adjacent Teeth',  'Independent<span class="comp-badge">✓</span>','Requires grinding','Independent<span class="comp-badge">✓</span>', true],
        ['Bone Stim.',      'Both sites<span class="comp-badge">✓</span>', 'None — resorption', 'One site only',       true],
        ['Complexity',      'Two surgeries', 'Single procedure<span class="comp-badge">✓</span>', 'One surgery',      false],
        ['AI Recommendation', `2 Implants${recBadge('implant2')}`, `4-Unit Bridge${recBadge('bridge4')}`, `Cantilever${recBadge('cantilever')}`, rec==='implant2'],
      ];
      tbody.innerHTML = rows.map(([label, imp, bri, crn, impBetter]) => `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td class="${impBetter?'winner':'loser'} ${rec==='implant2'?'comp-winner-col':''}">${imp}</td>
          <td class="${!impBetter?'winner':'loser'} ${rec==='bridge4'?'comp-winner-col':''}">${bri}</td>
          <td class="${rec==='cantilever'?'winner comp-winner-col':''}">${crn}</td>
        </tr>`).join('');
      return;
    }

    // ── SINGLE-TOOTH PATH (unchanged logic, hardened) ────────────────────
    const { implantInitial, bridgeInitialAdjusted, crownInitial, needsRCT, implant10yr, bridge10yr, crown10yr } = computeCosts(state, ai);
    const crownViable = ai.crownViable && ai.crown > 0;
    const crownSucStr = crownViable ? `${ai.crown.toFixed(1)}` : 'N/A';
    const crownCostStr = crownViable ? formatCurrency(crownInitial) + (needsRCT ? ' (+RCT)' : '') : 'N/A';
    const crown10yrStr = crownViable ? formatCurrency(crown10yr) : 'N/A';

    // Best scores for highlighting
    const scores = [ai.implant, ai.bridge, crownViable ? ai.crown : 0];
    const bestScore = Math.max(...scores);
    const costs = [implant10yr, bridge10yr, crownViable ? crown10yr : Infinity];
    const lowestCost = Math.min(...costs);

    const implantBestScore = ai.implant === bestScore;
    const bridgeBestScore  = ai.bridge  === bestScore;
    const crownBestScore   = crownViable && ai.crown === bestScore;
    const implantBestCost  = implant10yr === lowestCost;
    const bridgeBestCost   = bridge10yr  === lowestCost && !implantBestCost;
    const crownBestCost    = crownViable && crown10yr === lowestCost && !implantBestCost && !bridgeBestCost;

    const rows = [
      ['Suitability',
        `${ai.implant.toFixed(1)}${implantBestScore?'<span class="comp-badge">✓ Best</span>':''}`,
        `${ai.bridge.toFixed(1)}${bridgeBestScore?'<span class="comp-badge">✓ Best</span>':''}`,
        crownViable ? `${crownSucStr}${crownBestScore?'<span class="comp-badge">✓ Best</span>':''}` : '—',
        implantBestScore],
      ['Initial Cost',
        `${formatCurrency(implantInitial)}`,
        `${formatCurrency(bridgeInitialAdjusted)}`,
        crownViable ? crownCostStr + '<span class="comp-badge">✓ Lowest</span>' : '—', false],
      ['10‑Year Cost',
        `${formatCurrency(implant10yr)}${implantBestCost?'<span class="comp-badge">✓ Best</span>':''}`,
        `${formatCurrency(bridge10yr)}${bridgeBestCost?'<span class="comp-badge">✓ Best</span>':''}`,
        crownViable ? `${crown10yrStr}${crownBestCost?'<span class="comp-badge">✓ Best</span>':''}` : '—',
        implantBestCost],
      ['Longevity', '20‑25 years<span class="comp-badge">✓ Best</span>', '10‑15 years',
        crownViable?'10‑20 years':'—', true],
      ['Recovery Time', '3‑6 months',
        needsRCT?'2‑4 weeks<span class="comp-badge">✓ Faster</span>':'2‑4 weeks<span class="comp-badge">✓ Better</span>',
        crownViable?(needsRCT?'3‑4 wks (RCT)':'1‑2 wks<span class="comp-badge">✓ Fastest</span>'):'—', false],
      ['Adjacent Teeth', 'Not affected<span class="comp-badge">✓</span>', 'Requires grinding',
        crownViable?'Not affected<span class="comp-badge">✓</span>':'—', true],
      ['Tooth Preserved', 'No', 'No',
        crownViable?'Yes ✓<span class="comp-badge">Unique</span>':'<span style="color:var(--c-n300)">—</span>', false],
      ['Reversible', 'No', 'No',
        crownViable?'Yes ✓':'<span style="color:var(--c-n300)">—</span>', false],
      ['Bone Preservation', 'Stimulates bone<span class="comp-badge">✓</span>', 'Bone resorption', crownViable?'Preserves root':'—', true],
      ['AI Recommendation',
        ai.rec==='implant'?`Implant<span class="comp-badge">✓ Rec'd</span>`:'Implant',
        ai.rec==='bridge'?`Bridge<span class="comp-badge">✓ Rec'd</span>`:'Bridge',
        crownViable?(ai.rec==='crown'?`Crown<span class="comp-badge">✓ Rec'd</span>`:'Crown'):'—',
        ai.rec==='implant'],
    ];

    const implantHead = $('compImplantHead'), bridgeHead = $('compBridgeHead'), crownHead = $('compCrownHead');
    if (implantHead) implantHead.className = ai.rec==='implant' ? 'comp-winner-col' : '';
    if (bridgeHead)  bridgeHead.className  = ai.rec==='bridge'  ? 'comp-winner-col' : '';
    if (crownHead)   crownHead.className   = crownViable
      ? (ai.rec==='crown' ? 'comp-winner-col' : '')
      : 'crown-col-disabled';

    tbody.innerHTML = rows.map(([label, imp, bri, crn, implantBetter]) => `
      <tr class="${!crownViable ? 'comp-crown-row-na' : ''}">
        <td>${escapeHtml(label)}</td>
        <td class="${implantBetter?'winner':'loser'} ${ai.rec==='implant'?'comp-winner-col':''}">${imp}</td>
        <td class="${!implantBetter?'winner':'loser'} ${ai.rec==='bridge'?'comp-winner-col':''}">${bri}</td>
        <td class="${crownViable ? (ai.rec==='crown'?'winner comp-winner-col':'') : 'comp-crown-col-disabled'}" style="${!crownViable ? 'color:var(--c-n300);' : ''}">${crn}</td>
      </tr>`).join('');
  }
