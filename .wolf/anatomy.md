# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-22T14:03:25.317Z
> Files: 19 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `index.html` — denai — Clinical Insight (~113928 tok)
- `privacy.html` — Privacy Policy — denai (~2802 tok)
- `terms.html` — Terms of Service — denai (~3244 tok)

## .claude/


## .claude/rules/


## .github/workflows/


## docs/

- `cloud-schema.md` — denai — Cloud Schema Design & Persistence Contracts (~5440 tok)

## notes/


## src/ai/


## src/auth/

- `authModule.js` — Supabase auth lifecycle; signIn/signUp/signOut; session restore + onAuthStateChange; sidebar user area updates (local: 'Cases save to this device', signed-in: '☁ Cloud sync active'); Phase 8 flush() hooks; Phase 9 sidebar text updated (~2948 tok)
- `clinicSession.js` — Phase 3.4 clinic session context; init(client) loads clinic+role after auth; getClinicId/Role/Name/isOwner/getMembers; createClinic(name); clear() on sign-out; _initialized guard prevents re-query on token refresh; Phase 3.5 patch: _load() returns boolean so transient errors allow retry (~2050 tok)

## src/constants/

- `storageKeys.js` — Declares STORAGE_KEY (~52 tok)

## src/db/

- `schema.sql` — Production schema rev 4: profiles, patients, clinics, clinic_members, clinic_subscriptions (Phase 7), workflow_observations (Phase 8); RLS policies, idempotent triggers, composite indexes (~9100 tok)

## src/observe/

- `frictionLog.js` — Phase 8 friction observation; IIFE module window.denaiObserve; record(eventType, flags?) to localStorage ring buffer (200 events); flush(supabaseClient) silent cloud upload; allowlisted types only, no PHI, per-page session_id; degrades offline (~1256 tok)

## src/onboarding/

- `guidanceModule.js` — Phase 9 operational confidence guidance; IIFE window.denaiGuidance; hasSeen(key)/markSeen(key) localStorage-backed seen-state tracker; no tour engine, no analytics; guidance rendering done by index.html render paths (~212 tok)

## src/render/


## src/reports/

- `reportTemplates.js` — Shared report shell (rptShell), patient section, risk section, opt card, reasons section; references BRAND/escapeHtml/isMaxilla from inline script; 120 lines (~1800 tok)

## src/styles/


## src/styles/components/


## src/styles/tokens/


## src/styles/utilities/

- `print.css` — Main-app print media queries: color-adjust, hide sidebar/topbar, opt-card.active winner styles; Phase 10 added print-color-adjust exact (~450 tok)

## src/sync/

- `cloudSync.js` — src/sync/cloudSync.js (~4670 tok)
- `prefsSync.js` — src/sync/prefsSync.js (~3196 tok)
- `serializer.js` — Patient serializer for cloud write path; ALLOWED_FIELDS allowlist; clinicId excluded (typed column, not state JSONB) (~560 tok)
- `syncQueue.js` — src/sync/syncQueue.js (~4450 tok)

## src/utils/


## tests/a11y/


## tests/auth/

- `runner.js` — tests/auth/runner.js (~4115 tok)

## tests/ci/


## tests/e2e/

- `runner.js` — tests/e2e/runner.js (~6276 tok)

## tests/engine/


## tests/smoke/


## tests/sync/

- `runner.js` — tests/sync/runner.js (~4778 tok)
