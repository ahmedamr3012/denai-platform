  // ================================================================
  // RENDER: MATERIAL
  // ================================================================
  let _matFadeTimer = null;  // FIX#6: cancel stale fade timers on re-render
  function renderMaterial(state) {
    const isImp = state.tx === 'implant';
    const isCrn = state.tx === 'crown';
    const highOcc = state.occlusion === 'High occlusion load';
    const posterior = isPosteriorTooth(state.tooth);
    const matForEl = $('matFor');
    if (matForEl) matForEl.textContent = isImp ? '(for Implant)' : isCrn ? '(for Crown)' : '(for Bridge)';
    const primary = $('matPrimary'), alt = $('matAlt');
    if (!primary || !alt) return;
    primary.style.opacity = '0'; alt.style.opacity = '0';
    if (_matFadeTimer) { clearTimeout(_matFadeTimer); _matFadeTimer = null; }  // FIX#6
    _matFadeTimer = setTimeout(() => {
      _matFadeTimer = null;
      if (isCrn) {
        const cm = getCrownMaterial(state);
        $('matPrimaryName').textContent   = cm.name;
        $('matPrimaryReason').textContent = cm.reason;
        $('matPrimaryRate').textContent   = cm.rate;
        $('matAltName').textContent       = 'Alternative: ' + cm.alt;
        $('matAltReason').textContent     = cm.altReason;
        $('matAltRate').textContent       = cm.altRate;
      } else if (isImp) {
        $('matPrimaryName').textContent   = 'Titanium + Zirconia';
        $('matPrimaryReason').textContent = 'Best biocompatibility & load bearing';
        $('matPrimaryRate').textContent   = '95%+';
        $('matAltName').textContent       = 'Alternative: All‑Zirconia';
        $('matAltReason').textContent     = 'Metal allergy cases';
        $('matAltRate').textContent       = '88‑92%';
      } else if (!isCrn && highOcc) {
        $('matPrimaryName').textContent   = 'Zirconia (Bridge)';
        $('matPrimaryReason').textContent = posterior ? 'High load posterior — zirconia absorbs chewing forces best' : 'High occlusal load — zirconia offers maximum strength';
        $('matPrimaryRate').textContent   = '92‑95%';
        $('matAltName').textContent       = 'Alternative: e.max';
        $('matAltReason').textContent     = 'Suitable if load is low & esthetics critical';
        $('matAltRate').textContent       = '85‑90%';
      } else {
        $('matPrimaryName').textContent   = 'e.max (Bridge)';
        $('matPrimaryReason').textContent = posterior ? 'Excellent strength — still suitable for posterior region' : 'Ideal for anterior esthetics with low occlusal load';
        $('matPrimaryRate').textContent   = '90‑94%';
        $('matAltName').textContent       = 'Alternative: Zirconia';
        $('matAltReason').textContent     = posterior ? 'Maximum strength if load unexpectedly high' : 'Higher strength for additional safety';
        $('matAltRate').textContent       = '92‑95%';
      }
      primary.style.opacity = '1'; alt.style.opacity = '1';
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
