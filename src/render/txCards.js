// src/render/txCards.js
// Phase 17: Treatment card rendering — single-tooth, multi-tooth, restorative,
// score bar helper, and crown card state management.
//
// Globals consumed at call time (defined in inline script):
//   $, S, escapeHtml

// ── Score bar helper ──────────────────────────────────────────
// Updates the % display + progress bar on treatment option cards.
function setCardScore(slotKey, score, visible) {
  const valEl = $('score' + slotKey.charAt(0).toUpperCase() + slotKey.slice(1));  // scoreImplant etc.
  const fillEl = $('scoreFill' + slotKey.charAt(0).toUpperCase() + slotKey.slice(1));
  const barEl  = $('scoreBar'  + slotKey.charAt(0).toUpperCase() + slotKey.slice(1));
  if (!valEl || !fillEl) return;
  if (!visible || score === undefined || score === null) {
    if (barEl) barEl.style.display = 'none';
    return;
  }
  if (barEl) barEl.style.display = '';
  const pct = Math.max(0, Math.min(100, score || 0));
  valEl.textContent = typeof score === 'number' ? score.toFixed(1) + '%' : '–';
  fillEl.style.width = pct + '%';
}

// ── Treatment card dispatchers ────────────────────────────────
function renderTxCards(state, ai) {
  // Multi-tooth: relabel and redirect
  if (ai?.isMultiTooth) { renderMultiTxCards(ai); return; }
  // Restorative: relabel via ClinicalEngine-determined treatment universe
  if (ai?.treatmentMode === 'restorative') { renderRestorativeTxCards(state, ai); return; }

  // RESTORE single-tooth labels — renderMultiTxCards and renderRestorativeTxCards
  // mutate .opt-name/.opt-sub directly in the DOM. Switching back to single-tooth
  // without restoring means prior labels ("2 Implants", "Endocrown", etc.) persist.
  const _ci = $('cardImplant'), _cb = $('cardBridge'), _cc = $('cardCrown');
  if (_ci) {
    const n = _ci.querySelector('.opt-name'), s = _ci.querySelector('.opt-sub');
    if (n && n.textContent !== 'Implant')      n.textContent = 'Implant';
    if (s && s.textContent !== 'Single Crown') s.textContent = 'Single Crown';
  }
  if (_cb) {
    const n = _cb.querySelector('.opt-name'), s = _cb.querySelector('.opt-sub');
    if (n && n.textContent !== 'Bridge')        n.textContent = 'Bridge';
    if (s && s.textContent !== '3-Unit Bridge') s.textContent = '3-Unit Bridge';
  }
  if (_cc) {
    const n = _cc.querySelector('.opt-name'), s = _cc.querySelector('.opt-sub');
    if (n && n.textContent !== 'Crown')         n.textContent = 'Crown';
    if (s && s.textContent !== 'Single Crown')  s.textContent = 'Single Crown';
  }

  const isImp  = state.tx === 'implant';
  const isBri  = state.tx === 'bridge';
  const isCrn  = state.tx === 'crown';
  // Update score bars — primary scanability improvement
  setCardScore('Implant', ai?.implant,                   !!ai);
  setCardScore('Bridge',  ai?.bridge,                    !!ai);
  setCardScore('Crown',   ai?.crown,                     !!(ai?.crownViable));
  $('cardImplant').classList.toggle('active', isImp);
  $('cardBridge').classList.toggle('active', isBri);
  $('cardImplant').setAttribute('aria-checked', isImp ? 'true' : 'false');
  $('cardBridge').setAttribute('aria-checked', isBri ? 'true' : 'false');
  $('badgeImplant').textContent = isImp ? '✓ Selected' : (ai?.rec==='implant'?'★ Recommended':'Alternative');
  $('badgeImplant').className = 'opt-rec ' + (isImp || ai?.rec==='implant' ? 'opt-rec-g' : 'opt-rec-b');
  $('badgeBridge').textContent = isBri ? '✓ Selected' : (ai?.rec==='bridge'?'★ Recommended':'Alternative');
  $('badgeBridge').className = 'opt-rec ' + (isBri || ai?.rec==='bridge' ? 'opt-rec-g' : 'opt-rec-b');
  updateCrownCardState(ai, isCrn);
}

// ── Multi-tooth treatment cards renderer ─────────────────────
function renderMultiTxCards(ai) {
  if (!ai?.isMultiTooth) return;
  const TX_TO_MULTI = { implant: 'implant2', bridge: 'bridge4', crown: 'cantilever' };
  const activeTx = TX_TO_MULTI[S.tx] || 'implant2';
  // Score bars for multi-tooth options
  setCardScore('Implant', ai.implant2,    true);
  setCardScore('Bridge',  ai.bridge4,     true);
  setCardScore('Crown',   ai.cantilever,  true);
  const cards = [
    { id: 'cardImplant', tx: 'implant2',   score: ai.implant2,   label: '2 Implants',    sub: 'Best Long-Term' },
    { id: 'cardBridge',  tx: 'bridge4',    score: ai.bridge4,    label: '4-Unit Bridge', sub: 'Cost-Effective' },
    { id: 'cardCrown',   tx: 'cantilever', score: ai.cantilever, label: 'Implant + Cantilever', sub: 'Compromise Option' },
  ];
  cards.forEach(({ id, tx, score, label, sub }) => {
    const card  = $(id); const badge = $('badge' + id.replace('card',''));
    if (!card || !badge) return;
    const isActive = activeTx === tx;  // FIX: compare mapped value, not raw S.tx
    const isRec    = ai.rec === tx;
    const isIdeal  = ai.ideal === tx;
    card.querySelector('.opt-name').textContent = label;
    card.querySelector('.opt-sub').textContent  = sub;
    card.classList.toggle('active', isActive);
    card.classList.remove('disabled');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    badge.textContent = isActive   ? '✓ Selected'
                      : isRec      ? '★ Recommended'
                      : isIdeal    ? '✦ Ideal'
                      : 'Alternative';
    badge.className   = 'opt-rec ' + (isActive || isRec ? 'opt-rec-g' : isIdeal ? 'opt-rec-gold' : 'opt-rec-b');
  });
}

function renderRestorativeTxCards(state, ai) {
  if (!ai?.restorativeLabels) return;
  const TX_TO_SLOT = { implant: 'slot1', bridge: 'slot2', crown: 'slot3' };
  const SLOT_TO_TX = { slot1: 'implant', slot2: 'bridge', slot3: 'crown' };
  const activeSlot = TX_TO_SLOT[state.tx] || 'slot2';
  // Score bars — show the scored % for each restorative option
  setCardScore('Implant', ai.implant, true);
  setCardScore('Bridge',  ai.bridge,  true);
  setCardScore('Crown',   ai.crown,   true);
  const cards = [
    { id: 'cardImplant', slot: 'slot1', opt: ai.restorativeLabels.slot1 },
    { id: 'cardBridge',  slot: 'slot2', opt: ai.restorativeLabels.slot2 },
    { id: 'cardCrown',   slot: 'slot3', opt: ai.restorativeLabels.slot3 },
  ];
  cards.forEach(({ id, slot, opt }) => {
    const card = $(id), badge = $('badge' + id.replace('card',''));
    if (!card || !badge) return;
    const isActive = activeSlot === slot;
    const isRec    = ai.rec === SLOT_TO_TX[slot];
    card.querySelector('.opt-name').textContent = opt.label;
    card.querySelector('.opt-sub').textContent  = opt.sub;
    card.classList.toggle('active', isActive);
    card.classList.remove('disabled');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.setAttribute('tabindex', '0');
    card.removeAttribute('title');
    badge.textContent = isActive ? '✓ Selected' : isRec ? '★ Recommended' : 'Alternative';
    badge.className   = 'opt-rec ' + (isActive || isRec ? 'opt-rec-g' : 'opt-rec-b');
  });
  // Hide crown warning banner — restorative mode all options are valid
  const wb = $('crownWarningBanner');
  if (wb) wb.style.display = 'none';
}

function updateCrownCardState(ai, isCrn) {
  const crownCard = $('cardCrown'), badge = $('badgeCrown');
  if (!crownCard || !badge) return;
  const viable = ai?.crownViable;
  crownCard.classList.toggle('disabled', !viable);
  crownCard.classList.toggle('active', isCrn && viable);
  crownCard.setAttribute('aria-checked', (isCrn && viable) ? 'true' : 'false');
  crownCard.setAttribute('tabindex', viable ? '0' : '-1');
  if (!viable) {
    badge.textContent = 'Not Applicable';
    badge.className = 'opt-rec opt-rec-b';
    crownCard.setAttribute('title', ai?.crownWarning || 'Crown not viable for this condition');
  } else {
    crownCard.removeAttribute('title');
    badge.textContent = isCrn ? '✓ Selected' : (ai?.rec==='crown' ? '★ Recommended' : 'Alternative');
    badge.className = 'opt-rec ' + (isCrn || ai?.rec==='crown' ? 'opt-rec-g' : 'opt-rec-b');
  }
  const wb = $('crownWarningBanner');
  if (wb) {
    const show = !!ai?.crownWarning;
    wb.style.display = show ? 'flex' : 'none';
    const sp = wb.querySelector('span');
    if (sp && ai?.crownWarning) sp.textContent = ai.crownWarning;
  }
}
