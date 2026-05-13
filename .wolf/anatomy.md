# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-13T13:29:13.397Z
> Files: 25 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~18 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `index.html` — denai — Clinical Insight (~100669 tok)
- `README.md` — Project documentation (~0 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## notes/

- `denai-architecture-risk-registry.md` (~5229 tok)
- `denai-runtime-execution-chains.md` (~10202 tok)
- `denai-state-architecture-audit.md` — Declares reads (~2858 tok)

## src/styles/components/

- `history.css` — Wave-2 extraction: .history-list, .history-item, .history-item:last-child, .history-time (4 rules, no dark block — all token refs via neutral-tokens). Print override stays inline. (~80 tok)
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

- `print.css` — Wave-2 extraction: 2 @media print blocks (Premium Polish opt-card.active override + main suppression/layout block, 14 rules total). All hardcoded values, no token deps. JS report template @media print (line ~4669) left untouched. (~200 tok)
