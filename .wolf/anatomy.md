# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-14T14:42:52.911Z
> Files: 35 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~18 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `index.html` — denai — Clinical Insight (~73756 tok)
- `README.md` — Project documentation (~0 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## notes/

- `denai-architecture-risk-registry.md` (~5229 tok)
- `denai-runtime-execution-chains.md` (~10202 tok)
- `denai-state-architecture-audit.md` — Declares reads (~2858 tok)

## src/ai/

- `calcAI.js` — Wave-3 extraction: isPosteriorTooth, isMaxilla, isAdjacent, getAdjacentTeeth, calcAIMulti, calcAI. Pure functions — no DOM, no S, no localStorage. Globals exposed via classic-script top-level declarations. (~120 tok)
- `clinicalEngine.js` — Wave-3.5 extraction: full ClinicalEngine IIFE (415 lines). Stages: CT constants, normalize, classify, generateTreatments, scoreRestorative, recommend, explain, buildRestorativeResult, process, processCompound. Zero DOM, zero S, zero escapeHtml, zero computeCosts. Outbound deps: calcAI/calcAIMulti/isPosteriorTooth/isMaxilla (runtime only). Public API: Object.freeze({ process, processCompound, normalize, classify, CT }). Extraction complete — clinicalEngine.js is sole source of truth. (~1200 tok)

## src/render/

- `costGraphPanel.js` — Wave-4B.1 complete: renderCost + renderGraph. renderCost: 3-path router (restorative/multi-tooth/single-tooth), innerHTML replacement, calls computeCosts twice in single-tooth path. renderGraph: persistent SVG reuse pattern (PERF#2). Deps: escapeHtml, computeCosts, $, 7 cost constants — all costEngine globals. No S reads. Sole source of truth — inline copies removed from index.html. (~530 tok)
- `materialPanel.js` — Wave-4B.2 complete: _matFadeTimer (let, global lexical env) + renderMaterial + getCrownMaterial. renderMaterial: 4-branch selector (crown/implant/bridge-highOcc/bridge-default), 160ms fade, FIX#6 timer-cancel. getCrownMaterial: pure crown material selector. Deps: isPosteriorTooth, $. No S reads. beforeunload handler in inline script refs _matFadeTimer — valid (classic-script shared global scope). Sole source of truth. (~270 tok)

## src/reports/

- `reportTemplates.js` — Wave-4A complete: rptShell, rptPatientSection, rptRiskSection, rptOptCard, rptReasonsSection (5 pure template functions, extracted from index.html L3441–3561, inline copies removed). Deps: escapeHtml, isMaxilla, isPosteriorTooth, REPORT_CSS, BRAND — all inline globals. Sole source of truth. (~310 tok)

## src/styles/components/

- `cards.css` — Wave-2 extraction: .rec-banner/.rec-* (AI recommendation banner + sub-elements + recShimmer), .opt-card/.opt-* (treatment option cards + opt-grid + sel-badge + score bars), .feat-card/.features (feature cards + responsive breakpoints), .caseclass-strip, .crown-warning-banner, .opt-card.disabled, .crown-conditional, .parafunction-note. Preserves PREMIUM POLISH and BUG FIXES cascade layers in order. NOT extracted: .risk-nominal-strip, .preset-btn.crown, JS template-literal .opt-card styles. (~420 tok)
- `history.css` — Wave-2 extraction: .history-list, .history-item, .history-item:last-child, .history-time (4 rules, no dark block — all token refs via neutral-tokens). Print override stays inline. (~80 tok)
- `modal.css` — Wave-2 extraction: .modal-ov (overlay/backdrop, z-index:300, mFadeIn), .modal-box (white bg, --r-2xl, mSlide), body.dark .modal-box, .modal-close-btn (+hover+focus-visible), @keyframes mFadeIn/mSlide, @media(prefers-reduced-motion:no-preference) transition rule. 5 modal DOM instances: #newPatientModal, #deletePatientModal, #saveModal, #resetModal, #shortcutsModal. (~120 tok)
- `skeleton.css` — Wave-2 extraction: @keyframes skeleton-shimmer, .skeleton (canonical, --skeleton-base/shine tokens), skel-*/skeleton-wrap layout helpers, skeleton-text/circle/bar, card-skeleton-wrap, empty-state (+dark), card-error-fallback. Consolidated duplicate .skeleton — dead skeletonShimmer keyframe dropped. (~320 tok)
- `toast.css` — Styles: 5 rules (~279 tok)

## src/styles/tokens/

- `brand-tokens.css` — Wave-1 extraction: --c-brand-* family only (6 light + 6 dark-mode overrides) (~40 tok)
- `focus-tokens.css` — Wave-1 extraction: --focus-ring (1 light + 1 dark-mode override). COUPLING: rgba RGB channels hardcode brand color values (31,122,79 light / 42,156,103 dark) — will drift on palette change. (~45 tok)
- `layer-tokens.css` — Wave-1 extraction: --z-sidebar(30)/overlay(100)/modal(200)/toast(300) stacking scale (4 tokens, mode-invariant, primitive integers, no body.dark block) (~45 tok)
- `layout-tokens.css` — Wave-1 extraction: --r-sm/md/lg/xl/2xl radius scale + --sidebar-w/--topbar-h layout dims (7 tokens, mode-invariant, no body.dark block) (~50 tok)
- `motion-tokens.css` — Wave-1 extraction: --t-fast/base/spring timing primitives + --transition-card composite (4 tokens, mode-invariant). NOTE: --transition-card refs var(--t-base) — co-extracted. (~55 tok)
- `neutral-tokens.css` — Wave-1 extraction: --c-n50 through --c-n900 scale (11 light + 11 dark-mode overrides) (~60 tok)
- `risk-tokens.css` — Wave-1 extraction: --c-risk-low/med/high (hex) + --c-risk-*-bg (rgba at .08 opacity, 6 tokens, mode-invariant). DRIFT: bg values hardcode same RGB as solid counterparts, not token refs. (~65 tok)
- `shadow-tokens.css` — Wave-1 extraction: --shadow-xs/sm/md/lg/brand (5 light + 5 dark). NOTE: --shadow-brand hardcodes brand rgba, not a token ref. (~60 tok)
- `skeleton-tokens.css` — Wave-1 extraction: --skeleton-base/shine (2 light + 2 dark-mode overrides). Raw hex values, no cross-refs. (~50 tok)
- `state-tokens.css` — Wave-1 extraction: --c-success(#22c55e) / --c-warning(#f59e0b) / --c-danger(#ef4444) (3 tokens, mode-invariant, no body.dark block, no cross-refs to risk tokens) (~40 tok)
- `surface-tokens.css` — Wave-1 extraction: --surface-page/card/sidebar (3 light + 3 dark). COUPLING: light --surface-sidebar refs var(--c-brand-dark); dark --surface-sidebar hardcoded #0d1114 — intentional asymmetry. (~60 tok)
- `typography-tokens.css` — Wave-1 extraction: --font-body ('DM Sans' stack) + --font-display ('Sora') (2 tokens, mode-invariant). RISK: body{} hardcodes 'DM Sans' directly, not via token — pre-existing drift. (~45 tok)

## src/styles/utilities/

- `accessibility.css` — Wave-2 extraction: .skip-link (+:focus), 2× @media(prefers-reduced-motion:reduce) globals (+ .heartbeat-path override), :focus:not(:focus-visible), .sr-only (2 cascade layers), :focus-visible global, [aria-busy]/[aria-disabled] ARIA utilities, button/input:focus-visible high-contrast, .keyboard-user indicator. NOT extracted: .risk-pill.* (business-specific), component-owned :focus-visible rules. Loads after focus-tokens, before components. (~120 tok)
- `print.css` — Wave-2 extraction: 2 @media print blocks (Premium Polish opt-card.active override + main suppression/layout block, 14 rules total). All hardcoded values, no token deps. JS report template @media print (line ~4669) left untouched. (~200 tok)

## src/utils/

- `costEngine.js` — Wave-3.4 extraction: 7 cost constants (ANNUAL_CHECKUP, CROWN_REPLACE_PROB, CROWN_COST_RATIO, BRIDGE_REPLACE_PROB, BRIDGE_REPLACE_RATIO, STANDALONE_CROWN_REPLACE_PROB, STANDALONE_CROWN_REPLACE_RATIO) + computeCosts(state, ai). Pure function — no DOM, no S, no localStorage. Classic-script globals. Dual-definition active (Step A only). (~180 tok)
- `formatting.js` — Declares escapeHtml (~50 tok)
