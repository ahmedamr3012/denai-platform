// src/render/riskPanel.js
// Phase 21: Delegates risk panel rendering to the React island via denaiReactBridge.
// The full DOM template and imperative mutations have moved to:
//   src/react/RiskPanel.js  — React component (risk levels, compact state)
//   src/react/reactBridge.js — island mount/root lifecycle
//
// Call signature preserved: renderRisk(state, ai) — no call-site changes needed.

function renderRisk(state, ai) {
  if (!ai) return;
  if (typeof denaiReactBridge !== 'undefined') {
    denaiReactBridge.updateRiskPanel(state, ai);
  }
  // If React bridge is unavailable (CDN load failure), #riskPanelMount remains
  // empty — a visible gap rather than stale data. No partial state is shown.
}
