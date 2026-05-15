  function renderRisk(state, ai) {
    if (!ai) return;
    const RISK_STYLES = {
      Low: { style: 'color:#16a34a;font-weight:700', dotCls: 'dot-low', label: 'Low risk' },
      Medium: { style: 'color:#d97706;font-weight:700', dotCls: 'dot-med', label: 'Medium risk' },
      High: { style: 'color:#dc2626;font-weight:700', dotCls: 'dot-high', label: 'High risk' },
      Critical: { style: 'color:#7c2d12;font-weight:700;background:rgba(220,38,38,.1);padding:1px 4px;border-radius:3px', dotCls: 'dot-high', label: 'Critical risk' }  // EC#3
    };
    const setRisk = (id, level) => {
      const el = $(id); if (!el) return;
      const s = RISK_STYLES[level] || RISK_STYLES.Low;
      el.innerHTML = `<span style="${s.style}">${level || 'Low'}</span> <span class="dot ${s.dotCls}" aria-label="${s.label}"></span>`;
    };

    // Restorative mode: all options are crown/restorative — show crown risk section
    // plus implant risks only if escalation option (extract+implant) is selected
    if (ai?.treatmentMode === 'restorative') {
      const implantSection = $('implantRiskSection'), crownSection = $('crownRiskSection');
      const isExtractImpl = ai.scored?.find(t => t.slot === state.tx)?.id === 'extract_impl';
      if (implantSection) implantSection.style.display = isExtractImpl ? 'block' : 'none';
      if (crownSection)   crownSection.style.display   = 'block';
      if (ai.crownRisks) {
        setRisk('riskCaries',   ai.crownRisks.secondaryCaries);
        setRisk('riskCrownFrac',ai.crownRisks.crownFracture);
        setRisk('riskRootFrac', ai.crownRisks.rootFracture);
        setRisk('riskEndo',     ai.crownRisks.endodonticFailure);
        setRisk('riskParafunc', ai.crownRisks.parafunctionDamage);
      }
      if (isExtractImpl) {
        setRisk('riskPeri', ai.peri || 'Low');
        setRisk('riskBone', ai.boneR || 'Low');
        setRisk('riskOcc',  ai.occR  || 'Low');
        setRisk('riskSmoking', ai.smokingR || 'Low');
      }
      return;
    }
    // Derive approximate risk levels from available multi-tooth data.
    if (ai?.isMultiTooth) {
      const implantSection = $('implantRiskSection'), crownSection = $('crownRiskSection');
      if (implantSection) implantSection.style.display = 'block';
      if (crownSection)   crownSection.style.display   = 'none';
      // Approximate risks from bone/hygiene/smoking in state
      const periLevel   = state.hygiene === 'Poor' ? 'High' : state.hygiene === 'Fair' ? 'Medium' : 'Low';
      const boneLevel   = state.bone    === 'Poor' ? 'High' : state.bone    === 'Fair' ? 'Medium' : 'Low';
      const occLevel    = state.occlusion === 'High occlusion load' ? 'Medium' : 'Low';
      const smokeLevel  = (state.smoking||'Non-smoker') === 'Current smoker' ? 'High' : (state.smoking||'') === 'Former smoker' ? 'Medium' : 'Low';
      setRisk('riskPeri',    periLevel);
      setRisk('riskBone',    boneLevel);
      setRisk('riskOcc',     occLevel);
      setRisk('riskSmoking', smokeLevel);
      const diabRow = $('riskDiabetesRow');
      const hasDiabetes = (state.diabetes && state.diabetes !== 'None');
      if (diabRow) diabRow.style.display = hasDiabetes ? 'flex' : 'none';
      if (hasDiabetes) {
        const diabLevel = state.diabetes === 'Uncontrolled' ? 'High' : 'Medium';
        setRisk('riskDiabetes', diabLevel);
      }
      return;
    }

    // Single-tooth path (unchanged)
    const isCrown = state.tx === 'crown' && ai?.crownViable;
    const implantSection = $('implantRiskSection'), crownSection = $('crownRiskSection');
    if (implantSection) implantSection.style.display = isCrown ? 'none' : 'block';
    if (crownSection)   crownSection.style.display   = isCrown ? 'block' : 'none';
    if (!isCrown) {
      setRisk('riskPeri', ai.peri);
      setRisk('riskBone', ai.boneR);
      setRisk('riskOcc', ai.occR);
      setRisk('riskSmoking', ai.smokingR);
      const diabRow = $('riskDiabetesRow');
      const hasDiabetes = (state.diabetes && state.diabetes !== 'None');
      if (diabRow) diabRow.style.display = hasDiabetes ? 'flex' : 'none';
      if (hasDiabetes) setRisk('riskDiabetes', ai.diabetesR || 'Medium');
    } else if (ai.crownRisks) {
      setRisk('riskCaries',   ai.crownRisks.secondaryCaries);
      setRisk('riskCrownFrac',ai.crownRisks.crownFracture);
      setRisk('riskRootFrac', ai.crownRisks.rootFracture);
      setRisk('riskEndo',     ai.crownRisks.endodonticFailure);
      setRisk('riskParafunc', ai.crownRisks.parafunctionDamage);
    }
    _applyRiskCompact();
  }

  // FIX 5: Compact nominal state — reduces visual noise when all risks are Low.
  // When something IS elevated, the individual risk rows are immediately visible.
  function _applyRiskCompact() {
    const riskCard = document.querySelector('.risk-section');
    if (!riskCard) return;
    const riskVals = Array.from(riskCard.querySelectorAll('.risk-val'));
    const hasWarning = riskVals.some(el => {
      const t = el.textContent.toLowerCase();
      return t.includes('high') || t.includes('medium') || t.includes('med');
    });
    let strip = $('riskNominalStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'riskNominalStrip';
      strip.className = 'risk-nominal-strip';
      strip.innerHTML = '<i class="fa-solid fa-shield-check" aria-hidden="true"></i> All patient-level risks nominal';
      riskCard.insertBefore(strip, riskCard.firstChild);
    }
    // Collapse individual pills when all low; expand them when warnings exist
    strip.style.display = hasWarning ? 'none' : 'flex';
    riskVals.forEach(el => { el.closest('.risk-row')?.style?.setProperty('display', hasWarning ? '' : 'none'); });
  }
