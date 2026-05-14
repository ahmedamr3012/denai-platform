# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-12

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** denai — single-file clinical app (`index.html`, ~102k tok). All CSS is inline `<style>`. Token extraction pattern: create `src/styles/tokens/<group>-tokens.css`, add `<link>` before `<style>`, remove declarations from `:root` and `body.dark`.
- **Token extraction governance:** Light-mode and dark-mode overrides for a token family must be co-extracted as a single atomic unit. Never extract light-mode tokens without their `body.dark` counterparts.
- **Coupling pattern:** `--surface-sidebar: var(--c-brand-dark)` is a direct token reference. Renaming `--c-brand-dark` would silently break sidebar background. Treat as a known one-way dependency.
- **Hardcoded RGB drift risk:** `--shadow-brand`, `--focus-ring`, `body::before` background, and sidebar scrollbar thumbs all hardcode brand color RGB values (`31,122,79` and `42,156,103`) rather than referencing tokens. They will drift silently if brand color changes. Flag before any palette swap.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-05-14] **Dual-definition pattern is ONLY safe for `function` declarations, not `const`/`let`.** `function` declarations hoist and silently overwrite; `const`/`let` at top-level of a classic script cannot be re-declared — a second `const X` in the inline script block throws `SyntaxError: Identifier 'X' has already been declared` at parse time, crashing the entire app. For modules containing `const`/`let` globals, collapse Steps B+C into a single atomic operation: insert script tag and remove inline declarations in the same edit session, with no intermediate state.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-05-14] **UIState separation pattern (Wave 3.7.2).** `editing`, `whyOpen`, `historyOpen` moved from `S` to a standalone `UIState` object with a `setUIState(patch)` helper. Three-step sequence: (A) add UIState + setUIState without touching S, (B) migrate all mutation and read sites to UIState (including inline DOM reads within the same toggle functions — must migrate together or DOM breaks), (C) remove stale fields from S init, saveState() destructure, and switchPatient() Object.assign. `activeSite` deliberately left in S — it is a render-routing parameter, not a pure UI flag. `saveState()` destructure was simplified from `const { editing, whyOpen, historyOpen, ...serializable } = S` to `const serializable = { ...S }` since the fields are no longer in S. Persistence boundary is now structural (UIState never reaches saveState()) rather than convention-based (strip list).
