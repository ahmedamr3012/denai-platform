# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-06-10T12:10:50.345Z
> Files: 12 tracked | Anatomy hits: 0 | Misses: 0

## ../../.claude/projects/c--Users-Dr-Ahmed-Desktop-denai/memory/


## ./

- `index.html` — denai — Clinical Insight (~114488 tok)
- `package.json` — Node.js package manifest (~164 tok)

## .claude/


## .claude/rules/


## .github/workflows/


## docs/

- `founding-clinic-operations.md` — Founding Clinic Operations Runbook (~3818 tok)

## notes/


## src/ai/


## src/auth/

- `accessPolicy.js` — Wave B2A entitlement decision engine: pure effective-status derivation (client-side trial expiry → 'expired') + creation predicates (canCreatePatient/canCreatePlan/isEntitledClinic/canAccessHistoricalData) + FOUNDING_PHASE_ENABLED flag. Decisions only — no enforcement, no DOM, no I/O. (~2003 tok)
- `authModule.js` — src/auth/authModule.js (~4158 tok)
- `subscriptionPresenter.js` — Wave B2C pure presentation layer: describe(effectiveStatus, trialEndsAt, now, founding) → {tone, sidebar, title, detail} or null (present nothing). Days-only trial countdown, historical-access reassurance on all restricted states, null for unknown/founding-none. No policy, no DOM. (~1842 tok)

## src/constants/


## src/db/


## src/observe/


## src/onboarding/


## src/react/


## src/render/


## src/reports/


## src/styles/


## src/styles/components/


## src/styles/tokens/


## src/styles/utilities/


## src/sync/

- `cloudSync.js` — src/sync/cloudSync.js (~5471 tok)

## src/types/

- `globals.d.ts` — ================================================================ (~1167 tok)
- `state.d.ts` — ================================================================ (~1123 tok)

## src/utils/


## supabase/functions/stripe-webhook/


## tests/a11y/


## tests/auth/


## tests/ci/

- `syntax-check.js` — Node pre-check: parses every inline <script> block of index.html with new Function() to catch unbalanced braces/backticks after inline edits. Does NOT catch the </body>-in-template-literal browser quirk (bug-109) — smoke test covers that. Run: node tests/ci/syntax-check.js. (~444 tok)

## tests/e2e/


## tests/engine/


## tests/entitlements/

- `accessPolicy.test.js` — Node-only unit tests for the B2A decision engine (43 assertions: derivation matrix, founding flag, fail-open, stubbed live wrappers, exception safety). Run: npm run test:policy. (~1855 tok)
- `subscriptionPresenter.test.js` — tests/entitlements/subscriptionPresenter.test.js (~1870 tok)

## tests/smoke/


## tests/sync/

