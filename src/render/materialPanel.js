  // ================================================================
  // RENDER: MATERIAL
  // ================================================================
  let _matFadeTimer = null;  // FIX#6: cancel stale fade timers on re-render

  // R3.2: apply mat-selected class based on current selection ('primary' | 'alt' | null)
  function _syncMatSelected(primary, alt, sel) {
    if (primary) primary.classList.toggle('mat-selected', sel === 'primary');
    if (alt) alt.classList.toggle('mat-selected', sel === 'alt');
  }

  // R3.5: map restorative slot treatment id → material context vocabulary.
  // Slot id comes from clinicalEngine.generateTreatments() — must stay in sync.
  const _SLOT_ID_TO_MAT_CONTEXT = {
    onlay:        'overlay',   // Onlay/Overlay → ceramic/composite materials
    endocrown:    'crown',     // Endocrown (zirconia-based) → crown materials
    crown_core:   'crown',     // Crown + Core build-up → crown materials
    splinted:     'crown',     // Splinted Crowns → crown materials
    crown:        'crown',     // Standard Crown → crown materials
    extract_impl: 'implant',   // Extract + Implant escalation → implant materials
    crown_adv:    'crown',     // Crown + Core (advanced) → crown materials
  };

  // R3.5: derive the treatment-scoped material context from state + ai.
  // In restorative mode, state.tx ('implant'/'bridge'/'crown') maps to slots whose
  // clinical treatment id determines the correct material vocabulary.
  // In missing-tooth mode, state.tx IS the material context.
  function _getMatContext(state, ai) {
    if (ai?.treatmentMode === 'restorative' && ai.restorativeLabels) {
      const TX_TO_SLOT = { implant: 'slot1', bridge: 'slot2', crown: 'slot3' };
      const slotId = ai.restorativeLabels[TX_TO_SLOT[state.tx] || 'slot1']?.id;
      return _SLOT_ID_TO_MAT_CONTEXT[slotId] || 'crown';
    }
    return state.tx || 'bridge';  // 'implant' | 'bridge' | 'crown'
  }

  function renderMaterial(state, ai) {
    const highOcc  = state.occlusion === 'High occlusion load';
    const posterior = isPosteriorTooth(state.tooth);

    // R3.5: treatment-scoped context ('implant' | 'bridge' | 'crown' | 'overlay')
    const matContext = _getMatContext(state, ai);

    const CTX_LABEL_MAP = {
      implant: '(for Implant)',
      bridge:  '(for Bridge)',
      crown:   '(for Crown)',
      overlay: '(for Overlay)',
    };
    const matForEl = $('matFor');
    if (matForEl) matForEl.textContent = CTX_LABEL_MAP[matContext] || '(for Crown)';

    const primary = $('matPrimary'), alt = $('matAlt');
    if (!primary || !alt) return;

    // R3.2: click-to-select — property assignment prevents listener accumulation on re-renders
    primary.onclick = function() {
      setState({ selectedMaterial: S.selectedMaterial === 'primary' ? null : 'primary' });
      _syncMatSelected(primary, alt, S.selectedMaterial);
    };
    alt.onclick = function() {
      setState({ selectedMaterial: S.selectedMaterial === 'alt' ? null : 'alt' });
      _syncMatSelected(primary, alt, S.selectedMaterial);
    };

    // R3.2: instant selection feedback before the 160ms fade begins
    _syncMatSelected(primary, alt, state.selectedMaterial);

    primary.style.opacity = '0'; alt.style.opacity = '0';
    if (_matFadeTimer) { clearTimeout(_matFadeTimer); _matFadeTimer = null; }  // FIX#6
    _matFadeTimer = setTimeout(() => {
      _matFadeTimer = null;
      if (matContext === 'crown') {
        const cm = getCrownMaterial(state);
        $('matPrimaryName').textContent   = cm.name;
        $('matPrimaryReason').textContent = cm.reason;
        $('matPrimaryRate').textContent   = cm.rate;
        $('matAltName').textContent       = 'Alternative: ' + cm.alt;
        $('matAltReason').textContent     = cm.altReason;
        $('matAltRate').textContent       = cm.altRate;
      } else if (matContext === 'implant') {
        $('matPrimaryName').textContent   = 'Titanium + Zirconia';
        $('matPrimaryReason').textContent = 'Best biocompatibility & load bearing';
        $('matPrimaryRate').textContent   = '95%+';
        $('matAltName').textContent       = 'Alternative: All‑Zirconia';
        $('matAltReason').textContent     = 'Metal allergy cases';
        $('matAltRate').textContent       = '88‑92%';
      } else if (matContext === 'overlay') {
        // R3.5: overlay-specific material vocabulary — no bridge/implant leakage
        $('matPrimaryName').textContent   = 'Ceramic Overlay';
        $('matPrimaryReason').textContent = 'Superior esthetics & bond strength for conservative preparation';
        $('matPrimaryRate').textContent   = '91‑94%';
        $('matAltName').textContent       = 'Alternative: Composite Overlay';
        $('matAltReason').textContent     = 'Cost-effective option with adequate durability';
        $('matAltRate').textContent       = '85‑90%';
      } else {
        // Bridge (missing-tooth mode) — R3.5: treatment-scoped labels, no parentheticals
        if (highOcc) {
          $('matPrimaryName').textContent   = 'Zirconia Bridge';
          $('matPrimaryReason').textContent = posterior
            ? 'High load posterior — zirconia absorbs chewing forces best'
            : 'High occlusal load — zirconia offers maximum strength';
          $('matPrimaryRate').textContent   = '92‑95%';
          $('matAltName').textContent       = 'Alternative: e.max Bridge';
          $('matAltReason').textContent     = 'Suitable if load is low & esthetics critical';
          $('matAltRate').textContent       = '85‑90%';
        } else {
          $('matPrimaryName').textContent   = 'e.max Bridge';
          $('matPrimaryReason').textContent = posterior
            ? 'Excellent strength — still suitable for posterior region'
            : 'Ideal for anterior esthetics with low occlusal load';
          $('matPrimaryRate').textContent   = '90‑94%';
          $('matAltName').textContent       = 'Alternative: Zirconia Bridge';
          $('matAltReason').textContent     = posterior
            ? 'Maximum strength if load unexpectedly high'
            : 'Higher strength for additional safety';
          $('matAltRate').textContent       = '92‑95%';
        }
      }
      primary.style.opacity = '1'; alt.style.opacity = '1';
      _syncMatSelected(primary, alt, state.selectedMaterial);  // R3.2: re-apply after content update
    }, 160);
  }

  function getCrownMaterial(state) {
    const highOcc = state.occlusion === 'High occlusion load';
    const posterior = isPosteriorTooth(state.tooth);
    const bruxism = (state.parafunction === 'Bruxism' || state.parafunction === 'Both');
    if (bruxism || (highOcc && posterior)) {
      return { name: 'Monolithic Zirconia Crown', reason: 'Maximum fracture resistance for bruxism/high load (93.3% survival)', rate: '93-96%', alt: 'Layered Zirconia', altReason: 'Better esthetics, slightly less strength', altRate: '91-94%' };
    } else if (!highOcc && !posterior) {
      return { name: 'e.max (Lithium Disilicate) Crown', reason: 'Superior translucency for anterior esthetics (92-95% survival)', rate: '92-95%', alt: 'Layered Zirconia', altReason: 'More strength if load increases', altRate: '92-94%' };
    } else {
      return { name: 'Zirconia Crown', reason: 'Balanced strength and esthetics for moderate occlusal load', rate: '92-95%', alt: 'e.max Crown', altReason: 'Better esthetics if load is moderate', altRate: '90-93%' };
    }
  }
