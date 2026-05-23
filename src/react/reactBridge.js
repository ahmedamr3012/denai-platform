// src/react/reactBridge.js
// Phase 21: React island mounting bridge.
// Manages React root lifecycle for all denai React islands.
// Detects card rebuilds (body.innerHTML reset) by comparing element refs
// so roots are never reused against a stale mount point.
// Consumed by: renderRisk() in riskPanel.js.

window.denaiReactBridge = (function () {

  // Risk panel island state — tracks both the root and the DOM element it was
  // created on, so a card rebuild (which destroys and recreates #riskPanelMount)
  // is detected via reference inequality.
  var _riskRoot  = null;
  var _riskMount = null;

  function updateRiskPanel(state, ai) {
    if (!ai) return;
    if (typeof ReactDOM === 'undefined' || typeof denaiRiskPanel === 'undefined') return;
    var mount = document.getElementById('riskPanelMount');
    if (!mount) return;

    // Card was rebuilt (body.innerHTML reset) — old root is stale; create fresh.
    if (mount !== _riskMount) {
      _riskMount = mount;
      _riskRoot  = ReactDOM.createRoot(mount);
    }
    // flushSync guarantees DOM is updated before control returns — required for
    // synchronous smoke-test assertions and parity with legacy imperative DOM mutations.
    ReactDOM.flushSync(function () {
      _riskRoot.render(React.createElement(denaiRiskPanel.Component, { state: state, ai: ai }));
    });
  }

  return Object.freeze({ updateRiskPanel: updateRiskPanel });
})();
