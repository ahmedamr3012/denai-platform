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

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
