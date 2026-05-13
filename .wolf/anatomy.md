# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-13T09:31:43.975Z
> Files: 15 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~18 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `index.html` — denai — Clinical Insight (~102143 tok)
- `README.md` — Project documentation (~0 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## notes/

- `denai-architecture-risk-registry.md` (~5229 tok)
- `denai-runtime-execution-chains.md` (~10202 tok)
- `denai-state-architecture-audit.md` — Declares reads (~2858 tok)

## src/styles/tokens/

- `brand-tokens.css` — Wave-1 extraction: --c-brand-* family only (6 light + 6 dark-mode overrides) (~40 tok)
- `layer-tokens.css` — Wave-1 extraction: --z-sidebar(30)/overlay(100)/modal(200)/toast(300) stacking scale (4 tokens, mode-invariant, primitive integers, no body.dark block) (~45 tok)
- `layout-tokens.css` — Wave-1 extraction: --r-sm/md/lg/xl/2xl radius scale + --sidebar-w/--topbar-h layout dims (7 tokens, mode-invariant, no body.dark block) (~50 tok)
- `motion-tokens.css` — Wave-1 extraction: --t-fast/base/spring timing primitives + --transition-card composite (4 tokens, mode-invariant). NOTE: --transition-card refs var(--t-base) — co-extracted. (~55 tok)
- `neutral-tokens.css` — Wave-1 extraction: --c-n50 through --c-n900 scale (11 light + 11 dark-mode overrides) (~60 tok)
- `shadow-tokens.css` — Wave-1 extraction: --shadow-xs/sm/md/lg/brand (5 light + 5 dark). NOTE: --shadow-brand hardcodes brand rgba, not a token ref. (~60 tok)
