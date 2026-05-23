// src/react/RiskPanel.js
// Phase 21: React risk indicator panel island.
// Replaces the static .risk-box template in buildAICardStructure() and
// imperative DOM mutations in riskPanel.js with a declarative React component.
// Mounted into #riskPanelMount by reactBridge.js.
// Consumes: global React (from CDN). No JSX — React.createElement only.

window.denaiRiskPanel = (function () {
  var h = React.createElement;

  var RISK_STYLES = {
    Low:      { color: '#16a34a', dotCls: 'dot-low',  ariaLabel: 'Low risk' },
    Medium:   { color: '#d97706', dotCls: 'dot-med',  ariaLabel: 'Medium risk' },
    High:     { color: '#dc2626', dotCls: 'dot-high', ariaLabel: 'High risk' },
    Critical: { color: '#7c2d12', dotCls: 'dot-high', ariaLabel: 'Critical risk', bg: 'rgba(220,38,38,.1)', padding: '1px 4px', borderRadius: '3px' }
  };

  function RiskVal(props) {
    var s = RISK_STYLES[props.level] || RISK_STYLES.Low;
    var style = { color: s.color, fontWeight: '700' };
    if (s.bg) { style.background = s.bg; style.padding = s.padding; style.borderRadius = s.borderRadius; }
    return h('div', { className: 'risk-val', 'aria-live': 'polite' },
      h('span', { style: style }, props.level || 'Low'),
      ' ',
      h('span', { role: 'img', className: 'dot ' + s.dotCls, 'aria-label': s.ariaLabel })
    );
  }

  // Tooltip with multi-line support — splits on \n and inserts <br> elements.
  function Tooltip(props) {
    var lines = props.text.split('\n');
    var content = [];
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) content.push(h('br', { key: 'b' + i }));
      content.push(lines[i]);
    }
    return h('span', { className: 'tt' },
      h('span', { style: { fontSize: '11px', cursor: 'help' }, tabIndex: 0, 'aria-label': props.ariaLabel || '' }, 'ⓘ'),
      h('span', { className: 'tt-pop', role: 'tooltip' }, content)
    );
  }

  function RiskRow(props) {
    return h('div', { className: 'risk-row', style: props.hidden ? { display: 'none' } : undefined },
      h('div', { className: 'risk-lbl' },
        props.label,
        props.tooltip && h(Tooltip, { text: props.tooltip, ariaLabel: props.ariaLabel })
      ),
      h(RiskVal, { level: props.level })
    );
  }

  // Pure computation — derives all risk data from state + ai props.
  function _computeRisks(state, ai) {
    var mode = ai.treatmentMode || (ai.isMultiTooth ? 'multi' : 'single');
    var implantRisks = null, crownRisks = null;
    var showDiabetes = false, diabetesLevel = 'Medium';
    var showImplant = false, showCrown = false;

    if (mode === 'restorative') {
      var match = ai.scored && ai.scored.find(function (t) { return t.slot === state.tx; });
      var isExtractImpl = !!(match && match.id === 'extract_impl');
      showImplant = isExtractImpl;
      showCrown = true;
      if (ai.crownRisks) {
        crownRisks = {
          caries:    ai.crownRisks.secondaryCaries,
          crownFrac: ai.crownRisks.crownFracture,
          rootFrac:  ai.crownRisks.rootFracture,
          endo:      ai.crownRisks.endodonticFailure,
          parafunc:  ai.crownRisks.parafunctionDamage
        };
      }
      if (isExtractImpl) {
        implantRisks = { peri: ai.peri || 'Low', bone: ai.boneR || 'Low', occ: ai.occR || 'Low', smoking: ai.smokingR || 'Low' };
      }
    } else if (ai.isMultiTooth) {
      showImplant = true;
      var periLevel  = state.hygiene === 'Poor' ? 'High' : state.hygiene === 'Fair' ? 'Medium' : 'Low';
      var boneLevel  = state.bone    === 'Poor' ? 'High' : state.bone    === 'Fair' ? 'Medium' : 'Low';
      var occLevel   = state.occlusion === 'High occlusion load' ? 'Medium' : 'Low';
      var smokeLevel = (state.smoking || '') === 'Current smoker' ? 'High' : state.smoking === 'Former smoker' ? 'Medium' : 'Low';
      showDiabetes   = !!(state.diabetes && state.diabetes !== 'None');
      diabetesLevel  = state.diabetes === 'Uncontrolled' ? 'High' : 'Medium';
      implantRisks   = { peri: periLevel, bone: boneLevel, occ: occLevel, smoking: smokeLevel };
    } else {
      // single-tooth
      var isCrown = state.tx === 'crown' && ai.crownViable;
      showImplant = !isCrown;
      showCrown   = isCrown;
      if (!isCrown) {
        showDiabetes  = !!(state.diabetes && state.diabetes !== 'None');
        diabetesLevel = ai.diabetesR || 'Medium';
        implantRisks  = { peri: ai.peri, bone: ai.boneR, occ: ai.occR, smoking: ai.smokingR };
      } else if (ai.crownRisks) {
        crownRisks = {
          caries:    ai.crownRisks.secondaryCaries,
          crownFrac: ai.crownRisks.crownFracture,
          rootFrac:  ai.crownRisks.rootFracture,
          endo:      ai.crownRisks.endodonticFailure,
          parafunc:  ai.crownRisks.parafunctionDamage
        };
      }
    }

    // Derive hasWarning to drive compact/expanded state
    var allLevels = [];
    if (implantRisks) allLevels = allLevels.concat([implantRisks.peri, implantRisks.bone, implantRisks.occ, implantRisks.smoking]);
    if (showDiabetes) allLevels.push(diabetesLevel);
    if (crownRisks)   allLevels = allLevels.concat([crownRisks.caries, crownRisks.crownFrac, crownRisks.rootFrac, crownRisks.endo, crownRisks.parafunc]);
    var hasWarning = allLevels.some(function (l) { return l === 'High' || l === 'Medium' || l === 'Critical'; });

    return {
      implantRisks:  implantRisks,  crownRisks:   crownRisks,
      showDiabetes:  showDiabetes,  diabetesLevel: diabetesLevel,
      hasWarning:    hasWarning,    showImplant:   showImplant,  showCrown: showCrown
    };
  }

  function RiskPanelComponent(props) {
    if (!props.ai) return null;
    var risks  = _computeRisks(props.state, props.ai);
    var hidden = !risks.hasWarning; // hide individual rows when all risks are Low

    // Implant risk section — always rendered in DOM for backward-compatible selectors;
    // visibility controlled by style.display so #implantRiskSection always exists.
    var implantRows = [];
    if (risks.showImplant && risks.implantRisks) {
      var ir = risks.implantRisks;
      implantRows = [
        h(RiskRow, { key: 'peri', label: 'Peri-implantitis Risk', level: ir.peri,    hidden: hidden, ariaLabel: 'Peri-implantitis risk info', tooltip: 'Risk of inflammation around implant\nbased on hygiene & bone quality' }),
        h(RiskRow, { key: 'bone', label: 'Bone Loss Risk',        level: ir.bone,    hidden: hidden, ariaLabel: 'Bone loss risk info',          tooltip: 'Likelihood of peri-implant\nbone resorption over time' }),
        h(RiskRow, { key: 'occ',  label: 'Occlusal Overload',     level: ir.occ,     hidden: hidden, ariaLabel: 'Occlusal overload risk info',   tooltip: 'Excessive bite force risk —\nnight guard recommended' }),
        h(RiskRow, { key: 'smk',  label: 'Smoking Risk',          level: ir.smoking, hidden: hidden, ariaLabel: 'Smoking risk info',             tooltip: 'Active smoking significantly increases\nimplant failure and peri-implantitis risk' })
      ];
      if (risks.showDiabetes) {
        implantRows.push(h(RiskRow, { key: 'diab', label: 'Diabetes Risk', level: risks.diabetesLevel, hidden: hidden, ariaLabel: 'Diabetes risk info', tooltip: 'Uncontrolled HbA1c ≥7.5% causes\n2–3× higher implant failure & poor healing' }));
      }
    }
    var implantSection = h('div', { id: 'implantRiskSection', style: risks.showImplant ? undefined : { display: 'none' } }, implantRows);

    // Crown risk section — always rendered in DOM for backward-compatible selectors;
    // visibility controlled by style.display so #crownRiskSection always exists.
    var crownRows = [];
    if (risks.showCrown && risks.crownRisks) {
      var cr = risks.crownRisks;
      crownRows = [
        h(RiskRow, { key: 'caries',    label: 'Secondary Caries Risk', level: cr.caries,    hidden: hidden, tooltip: 'Risk of decay at crown margin.\nHygiene is the #1 factor' }),
        h(RiskRow, { key: 'crownFrac', label: 'Crown Fracture Risk',   level: cr.crownFrac, hidden: hidden, tooltip: 'Risk of ceramic fracture.\nParafunction = 60% failure rate' }),
        h(RiskRow, { key: 'rootFrac',  label: 'Root Fracture Risk',    level: cr.rootFrac,  hidden: hidden, tooltip: 'Risk of vertical root fracture.\nNo ferrule = 60% early failure' }),
        h(RiskRow, { key: 'endo',      label: 'Endodontic Failure',    level: cr.endo,      hidden: hidden, tooltip: 'Risk of RCT failure after crown.\nRCT done = 91.3% survival at 10yr' }),
        h(RiskRow, { key: 'parafunc',  label: 'Parafunction Damage',   level: cr.parafunc,  hidden: hidden, tooltip: 'Bruxism/clenching damage.\nNight guard REQUIRED if present' })
      ];
    }
    var crownSection = h('div', { id: 'crownRiskSection', style: risks.showCrown ? { display: 'block' } : undefined }, crownRows);

    return h('div', { className: 'risk-box', 'aria-label': 'Risk indicators' },
      h('div', { className: 'risk-title', 'aria-hidden': 'true' }, 'Risk Indicators'),
      // Compact nominal strip — shown only when all risks are Low
      hidden && h('div', { className: 'risk-nominal-strip' },
        h('i', { className: 'fa-solid fa-shield-check', 'aria-hidden': 'true' }),
        ' All patient-level risks nominal'
      ),
      implantSection,
      crownSection
    );
  }

  return { Component: RiskPanelComponent };
})();
