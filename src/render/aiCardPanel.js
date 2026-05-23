// src/render/aiCardPanel.js
// Phase 17: AI card rendering — structure builder, skeleton helpers, value updaters,
// explanation renderer, and bilingual (Arabic) rendering bridge.
//
// Globals consumed at call time (defined in inline script or earlier blocking scripts):
//   $, S, UIState, escapeHtml, animateNumber, formatTooth, isMaxilla, isPosteriorTooth,
//   denaiExplain, denaiArabic, toggleAILang, toggleHelp

// ── AI card DOM structure builder ─────────────────────────────
function buildAICardStructure(force = false) {
  const body = $('aiCardBody');
  if (!body || (body.dataset.built === '1' && !force)) return;  // BUG#2: force-rebuild on condition change
  body.dataset.built = '1';
  body.removeAttribute('aria-busy');  // clear skeleton aria-busy before injecting real structure
  // R1.1: Arabic toggle removed from UI. Reset any persisted Arabic state so clinics
  // are not silently stuck in Arabic with no escape route.
  if (typeof denaiArabic !== 'undefined' && denaiArabic.isArabic()) denaiArabic.setLang('en');
  body.innerHTML = `
    <div class="crown-warning-banner" id="crownWarningBanner" role="alert" aria-live="polite">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span></span>
    </div>
    <button class="rec-banner" id="recBanner" type="button" aria-label="Apply AI recommendation: click to select">
      <div class="rec-icon" aria-hidden="true"><i class="fa-solid fa-check" id="recIcon"></i></div>
      <div class="rec-content">
        <div class="rec-label">AI Recommendation <span style="opacity:.6;font-size:10px;">↗ Click to apply</span></div>
        <div class="rec-text" id="recText"></div>
        <div class="rec-top-reason" id="recTopReason"></div>
      </div>
      <i class="fa-solid fa-arrow-right rec-arrow" aria-hidden="true"></i>
    </button>
    <div class="metrics-row">
      <div class="metric-card" aria-label="Recommendation strength">
        <div class="metric-lbl" style="display:flex;align-items:center;gap:5px;">Rec. Strength <button class="help-trigger" id="helpTrig_conf" type="button" onclick="toggleHelp('conf')" aria-expanded="${UIState.helpOpen.conf ? 'true' : 'false'}" aria-controls="helpBody_conf" aria-label="About recommendation strength">?</button></div>
        <div class="liquid-ring-wrap" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 56 56" focusable="false">
            <circle cx="28" cy="28" r="23" class="ring-track"/>
            <circle cx="28" cy="28" r="23" class="ring-fill" id="ringFill"/>
            <text x="28" y="33" text-anchor="middle" fill="var(--c-brand-dark)" font-weight="800" font-size="17" font-family="Sora,sans-serif" id="confVal">93</text>
          </svg>
        </div>
        <div class="conf-level" id="confLevel" role="status">High</div>
      </div>
      <div class="metric-card" aria-label="Estimated success rate">
        <div class="metric-lbl">Est. Success</div>
        <div class="metric-big" id="successVal" aria-live="polite">85%</div>
        <div class="metric-sub" id="successSub">—</div>
        <div class="prog-bar" aria-hidden="true"><div class="prog-fill" id="successBar" style="width:85%"></div></div>
      </div>
    </div>
    <div class="disclosure-body${UIState.helpOpen.conf ? ' open' : ''}" id="helpBody_conf" role="region" aria-label="Recommendation strength">
      <span class="disclosure-text">Recommendation strength reflects how consistently the clinical inputs point toward this option. A lower score indicates competing factors or case complexity — not that the recommendation is clinically inappropriate. This is not a probability of success or a diagnostic metric.</span>
    </div>
    <p class="ai-boundary">This recommendation is generated from the clinical inputs provided and supports — not replaces — clinical judgment.</p>
    <p class="ai-inputs" id="aiInputLine"></p>
    <div id="confRationale" class="conf-rationale" style="display:none;" aria-live="polite"></div>
    <button class="why-toggle" id="whyToggle" type="button" aria-expanded="false" aria-controls="whyBody">
      💡 Why this recommendation? <span class="chevron" aria-hidden="true">▾</span>
    </button>
    <div class="why-body" id="whyBody" role="region" aria-labelledby="whyToggle">
      <div class="reasons-wrap" id="reasonsList"></div>
    </div>
    <div id="riskPanelMount"></div>`;
}

// ── Skeleton helpers ──────────────────────────────────────────
function showSkeleton(containerId) {
  const el = $(containerId);
  if (!el) return;
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `
    <div class="card-skeleton-wrap">
      <div class="skeleton skeleton-text w60"></div>
      <div class="skeleton skeleton-text w80"></div>
      <div class="skeleton skeleton-text w40"></div>
      <div class="skeleton skeleton-bar"></div>
    </div>`;
  // Skeleton replaces the card's real DOM structure. Clear the built flag so
  // the next buildAICardStructure() call rebuilds instead of returning early.
  delete el.dataset.built;
}
function showMetricSkeleton() {
  const confEl = $('confVal'); const sucEl = $('successVal');
  if (confEl) confEl.textContent = '—';
  if (sucEl)  sucEl.textContent  = '—%';
  const bar = $('successBar'); if (bar) bar.style.width = '0%';
}
function hideSkeleton(containerId) {
  const el = $(containerId); if (el) el.removeAttribute('aria-busy');
}

// ── updateAICard for multi-tooth ─────────────────────────────
function updateAICardMulti(ai) {
  if (!ai?.isMultiTooth) return;
  const circ = 2 * Math.PI * 23;
  const ring = $('ringFill');
  if (ring) { ring.setAttribute('stroke-dasharray', circ); ring.setAttribute('stroke-dashoffset', circ - (ai.conf / 100) * circ); }
  const confValEl = $('confVal'), confLvlEl = $('confLevel');
  if (confValEl) confValEl.textContent = ai.conf;
  if (confLvlEl) confLvlEl.textContent = ai.confLevel;

  const rateMap = { implant2: ai.implant2, bridge4: ai.bridge4, cantilever: ai.cantilever };
  const displayRate = rateMap[ai.rec] || ai.implant2;
  animateNumber('successVal', displayRate.toFixed(1), '%');
  const bar = $('successBar'); if (bar) bar.style.width = displayRate + '%';

  // Sub label
  const subEl = $('successSub');
  const recLabel = { implant2: '2 Implants', bridge4: '4-Unit Bridge', cantilever: 'Implant + Cantilever' };
  if (subEl) subEl.textContent = (recLabel[ai.rec] || 'Recommended') + ' — ' + ai.caseCount;

  // Rec banner
  const recText = $('recText');
  const bannerLabel = { implant2: '2 Implants recommended', bridge4: '4-Unit Bridge recommended', cantilever: 'Implant + Cantilever recommended' };
  if (recText) typewriterEffect(recText, bannerLabel[ai.rec] || 'Multi-tooth recommendation', 28);

  // Scores in comparison inline
  const cImp = $('cImplantSuc'), cBri = $('cBridgeSuc'), cCrn = $('cCrownSuc');
  if (cImp) cImp.textContent = ai.implant2.toFixed(1) + '%';
  if (cBri) cBri.textContent = ai.bridge4.toFixed(1)  + '%';
  if (cCrn) cCrn.textContent = ai.cantilever.toFixed(1) + '%';

  // Relabel comparison headers
  const compI = $('compImplantHead'), compB = $('compBridgeHead'), compC = $('compCrownHead');
  if (compI) compI.textContent = '2 Implants';
  if (compB) compB.textContent = '4-Unit Bridge';
  if (compC) compC.textContent = 'Cantilever';

  // Reasons
  renderReasons(ai.reasons, ai.factors);

  // Abutment warning banner
  const crownBanner = $('crownWarningBanner');
  if (crownBanner) {
    if (ai.abutmentCompromised) {
      crownBanner.textContent = '⚠ Compromised abutments: bridge and cantilever reliability reduced';
      crownBanner.style.display = 'block';
    } else {
      crownBanner.style.display = 'none';
    }
  }

  // Trust surface: show which clinical inputs were used
  const inputLineM = $('aiInputLine');
  if (inputLineM) {
    if (S.tooth) {
      const jaw = isMaxilla(S.tooth) ? 'maxilla' : 'mandible';
      const pos = isPosteriorTooth(S.tooth) ? 'posterior' : 'anterior';
      const boneStr = S.bone ? ', bone: ' + S.bone.toLowerCase() : '';
      const hygStr  = S.hygiene ? ', hygiene: ' + S.hygiene.toLowerCase() : '';
      inputLineM.textContent = `Based on: tooth ${formatTooth(S.tooth)} (${jaw}, ${pos})${boneStr}${hygStr}`;
    } else {
      inputLineM.textContent = '';
    }
  }
}

function updateAICard(ai) {
  if (!ai) return;
  const circ = 2 * Math.PI * 23;
  const ring = $('ringFill');
  if (ring) { ring.setAttribute('stroke-dasharray', circ); if (Number.isFinite(ai.conf)) ring.setAttribute('stroke-dashoffset', circ - (ai.conf / 100) * circ); }
  const confValEl = $('confVal'), confLvlEl = $('confLevel');
  if (confValEl) confValEl.textContent = ai.conf;
  if (confLvlEl) confLvlEl.textContent = ai.confLevel;

  // Show the AI-recommended option's success rate in Est. Success
  const rateMap = ai.isMultiTooth
    ? { implant: ai.implant2, bridge: ai.bridge4, crown: ai.cantilever,
        implant2: ai.implant2, bridge4: ai.bridge4, cantilever: ai.cantilever }
    : { implant: ai.implant, bridge: ai.bridge, crown: ai.crown || ai.implant };
  const displayRate = rateMap[ai.rec] ?? (ai.isMultiTooth ? ai.implant2 : ai.implant);
  animateNumber('successVal', Number.isFinite(displayRate) ? displayRate.toFixed(1) : '0.0', '%');
  const bar = $('successBar'); if (bar) bar.style.width = displayRate + '%';
  const subEl = $('successSub');

  const recLabel = ai.treatmentMode === 'restorative'
    ? ai.recDisplay
    : (ai.rec === 'crown' ? 'Crown (natural tooth preserved)' : ai.rec === 'bridge' ? 'Bridge' : 'Implant');
  if (subEl) subEl.textContent = ai.conf >= 80 ? `${ai.caseCount} — ${recLabel} indicated` : ai.conf >= 60 ? 'Moderate strength — review all factors' : 'Lower strength — review all options carefully';

  const recText = $('recText'), recIcon = $('recIcon');
  if (recText) {
    let recStr;
    if (ai.treatmentMode === 'restorative') {
      recStr = (ai.recDisplay || 'Crown') + ' recommended';
      if (ai.caseClass?.notes) recStr += ` — ${ai.caseClass.notes.toLowerCase()}`;
    } else if (ai.isMultiTooth) {
      const recLabel2 = ai.rec === 'bridge4' ? '4-Unit Bridge' : ai.rec === 'cantilever' ? 'Implant + Cantilever' : '2 Implants';
      const idealLabel = ai.ideal !== ai.rec ? ` · Ideal: ${ai.ideal === 'implant2' ? '2 Implants' : 'Cantilever'}` : '';
      recStr = recLabel2 + ' recommended' + idealLabel;
    } else {
      const recMap = { implant: 'Implant is the recommended option', bridge: 'Bridge may be more suitable', crown: 'Crown is the recommended option' };
      recStr = recMap[ai.rec] || recMap.implant;
    }
    const recSuffix = ai.conf < 60 ? ' — review all options carefully' : '';
    typewriterEffect(recText, recStr + recSuffix, 30);
  }
  if (recIcon) recIcon.className = 'fa-solid ' + (
    ai.treatmentMode === 'restorative'
      ? (ai.recDisplay?.includes('Endocrown') ? 'fa-crown' : ai.recDisplay?.includes('Extract') ? 'fa-hospital' : ai.recDisplay?.includes('Splinted') ? 'fa-layer-group' : ai.recDisplay?.includes('Onlay') ? 'fa-gem' : 'fa-crown')
      : ai.rec === 'implant' || ai.rec === 'implant2' ? 'fa-check'
      : ai.rec === 'crown' ? 'fa-crown'
      : ai.rec === 'bridge4' ? 'fa-bridge'
      : ai.rec === 'cantilever' ? 'fa-wrench'
      : 'fa-exclamation'
  );

  // FIX 2: Case classification badge — prominent VIABLE / COMPROMISED / HOPELESS signal
  const badge = $('caseClassBadge');
  if (badge) {
    if (ai.treatmentMode === 'restorative' && ai.caseClass) {
      const typeMap = {
        RESTORATIVE_VIABLE:      { cls: 'viable',      icon: '✓', label: 'Restorable Tooth',   note: 'Good prognosis' },
        RESTORATIVE_COMPROMISED: { cls: 'compromised', icon: '⚠', label: 'Compromised Tooth',  note: 'Guarded prognosis' },
        RESTORATIVE_HOPELESS:    { cls: 'hopeless',    icon: '✕', label: 'Poor Prognosis',      note: 'Extraction recommended' },
      };
      const info = typeMap[ai.caseClass.type] || { cls:'viable', icon:'●', label: ai.caseClass.label || 'Restorable', note:'' };
      badge.className = 'caseclass-strip ' + info.cls;
      badge.style.display = 'flex';
      const iconEl = $('caseClassIcon'), lblEl = $('caseClassLabel'), noteEl = $('caseClassNote');
      if (iconEl) iconEl.textContent = info.icon;
      if (lblEl)  lblEl.textContent  = info.label;
      if (noteEl) noteEl.textContent = ai.caseClass.notes || info.note;
    } else {
      badge.style.display = 'none';
      if (UIState.helpOpen.caseClass) {
        UIState.helpOpen.caseClass = false;
        const _hbc = document.getElementById('helpBody_caseClass');
        if (_hbc) _hbc.classList.remove('open');
        const _htc = document.getElementById('helpTrig_caseClass');
        if (_htc) _htc.setAttribute('aria-expanded','false');
      }
    }
  }

  // FIX 4: Inline top reason — first clinical rationale visible without Ctrl+X
  const topReason = $('recTopReason');
  if (topReason) {
    const firstReason = ai.reasons?.[1] || ai.reasons?.[0];  // [0] is case classification; [1] is first clinical rationale
    if (firstReason) {
      topReason.textContent = firstReason;
      topReason.style.display = 'block';
    } else {
      topReason.style.display = 'none';
    }
  }

  // Trust surface: show which clinical inputs were used
  const inputLine = $('aiInputLine');
  if (inputLine) {
    if (S.tooth) {
      const jaw = isMaxilla(S.tooth) ? 'maxilla' : 'mandible';
      const pos = isPosteriorTooth(S.tooth) ? 'posterior' : 'anterior';
      const boneStr = S.bone ? ', bone: ' + S.bone.toLowerCase() : '';
      const hygStr  = S.hygiene ? ', hygiene: ' + S.hygiene.toLowerCase() : '';
      inputLine.textContent = `Based on: tooth ${formatTooth(S.tooth)} (${jaw}, ${pos})${boneStr}${hygStr}`;
    } else {
      inputLine.textContent = '';
    }
  }
}

// var (not let) so _typewriterTimer is accessible globally from the inline cleanup handler
var _typewriterTimer = null;
function typewriterEffect(element, text, speed = 40) {
  if (!element) return;
  if (_typewriterTimer) { clearInterval(_typewriterTimer); _typewriterTimer = null; }
  element.textContent = '';
  element.classList.add('typewriter-cursor');
  let i = 0;
  _typewriterTimer = setInterval(() => {
    if (i < text.length) { element.textContent += text.charAt(i); i++; }
    else { clearInterval(_typewriterTimer); _typewriterTimer = null; element.classList.remove('typewriter-cursor'); }
  }, speed);
}

// ── Explanation renderers ─────────────────────────────────────
function renderReasons(list, factors) {
  if (!Array.isArray(list)) return;
  const el = $('reasonsList');
  if (!el) return;
  const factorHtml = factors && factors.length
    ? `<div class="ai-factor-row" aria-label="Contributing factors">${
        factors.map(f => `<span class="ai-factor ${f.type}" title="${f.delta > 0 ? '+' : ''}${f.delta}% to implant score">${escapeHtml(f.label)}</span>`).join('')
      }</div>`
    : '';
  el.innerHTML = factorHtml + list.map(r => `<div class="reason-item"><i class="fa-solid fa-check" aria-hidden="true"></i>${escapeHtml(r)}</div>`).join('');
}

// Phase 14: Typed explanation renderer
const BLOCK_RENDER = {
  classification:   { icon: 'fa-solid fa-tag' },
  rationale:        { icon: 'fa-solid fa-check' },
  contraindication: { icon: 'fa-solid fa-triangle-exclamation' },
  escalation:       { icon: 'fa-solid fa-arrow-up-right-from-square' },
  tradeoff:         { icon: 'fa-solid fa-scale-balanced' },
};

function renderExplanation(expl, ai) {
  const el = $('reasonsList');
  if (!el) return;
  if (!expl) { renderReasons(ai?.reasons || [], ai?.factors); return; }

  const factors = expl?.factors || ai?.explanation?.factors || ai?.factors || [];
  const factorHtml = factors.length
    ? `<div class="ai-factor-row" aria-label="Contributing factors">${
        factors.map(f => `<span class="ai-factor ${f.type}" title="${f.delta > 0 ? '+' : ''}${f.delta}%">${escapeHtml(f.label)}</span>`).join('')
      }</div>`
    : '';

  const blockHtml = (expl.blocks || []).map(b => {
    const info = BLOCK_RENDER[b.type] || BLOCK_RENDER.rationale;
    return `<div class="reason-item reason-item--${escapeHtml(b.type)}"><i class="${info.icon}" aria-hidden="true"></i><span>${escapeHtml(b.text)}</span></div>`;
  }).join('');

  const signals = expl.referralSignals || [];
  const refHtml = signals.length
    ? `<div class="referral-signals" aria-label="Specialist considerations">${
        signals.map(s => `<div class="referral-signal-item"><i class="fa-solid fa-circle-arrow-right" aria-hidden="true"></i><span>${escapeHtml(s)}</span></div>`).join('')
      }</div>`
    : '';

  el.innerHTML = factorHtml + blockHtml + refHtml;
}

// Single entry point for all explanation rendering.
// Routes to typed renderExplanation for single-tooth restorative cases;
// falls back to simple renderReasons for multi-tooth (handled in updateAICardMulti).
function renderAIExplanation(ai) {
  if (!ai) return;
  const confRatEl = $('confRationale');
  if (ai.isMultiTooth || typeof denaiExplain === 'undefined') {
    if (!ai.isMultiTooth) renderReasons(ai.reasons, ai.factors);
    if (confRatEl) { confRatEl.textContent = ''; confRatEl.style.display = 'none'; confRatEl.dir = ''; }
    return;
  }
  const expl = denaiExplain.buildExplanation(ai);
  // Phase 16: translate explanation blocks when clinician has selected Arabic mode
  const _useAr = typeof denaiArabic !== 'undefined' && denaiArabic.isArabic();
  const _displayExpl = _useAr ? denaiArabic.localizeExpl(expl) : expl;
  renderExplanation(_displayExpl, ai);
  const reasonsEl = $('reasonsList');
  if (reasonsEl) reasonsEl.dir = _useAr ? 'rtl' : '';
  if (confRatEl) {
    const _rationale = _displayExpl && _displayExpl.confidenceRationale;
    if (_rationale) {
      confRatEl.textContent = _rationale;
      confRatEl.style.display = 'block';
      confRatEl.dir = _useAr ? 'rtl' : '';
    } else {
      confRatEl.textContent = '';
      confRatEl.style.display = 'none';
      confRatEl.dir = '';
    }
  }
}
