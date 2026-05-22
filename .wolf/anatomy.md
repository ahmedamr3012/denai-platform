# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-22T12:21:39.965Z
> Files: 15 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `index.html` — denai — Clinical Insight (~113378 tok)
- `privacy.html` — Privacy Policy — denai (~2794 tok)
- `terms.html` — Terms of Service — denai (~3236 tok)

## .claude/


## .claude/rules/


## .github/workflows/


## docs/

- `cloud-schema.md` — denai — Cloud Schema Design & Persistence Contracts (~5440 tok)

## notes/


## src/ai/


## src/auth/

- `authModule.js` — src/auth/authModule.js (~2833 tok)
- `clinicSession.js` — Phase 3.4 clinic session context; init(client) loads clinic+role after auth; getClinicId/Role/Name/isOwner/getMembers; createClinic(name); clear() on sign-out; _initialized guard prevents re-query on token refresh; Phase 3.5 patch: _load() returns boolean so transient errors allow retry (~2050 tok)

## src/constants/

- `storageKeys.js` — Declares STORAGE_KEY (~52 tok)

## src/db/

- `schema.sql` — denai Cloud Schema v2 — profiles, patients (+ clinic_id Phase 3.2), clinics, clinic_members; RLS isolation (Phase 3.3: 9 policies); Phase 3.4: clinic_members_select_owner_roster policy; indexes; FK migration; touch_updated_at trigger (~6408 tok)

## src/render/


## src/reports/


## src/styles/


## src/styles/components/


## src/styles/tokens/


## src/styles/utilities/


## src/sync/

- `cloudSync.js` — Cloud read path; hydrate, merge, tombstone cleanup; Phase 3.2: fetches clinic_id, propagates to local clinicId (~4700 tok)
- `prefsSync.js` — src/sync/prefsSync.js (~3196 tok)
- `serializer.js` — Patient serializer for cloud write path; ALLOWED_FIELDS allowlist; clinicId excluded (typed column, not state JSONB) (~560 tok)
- `syncQueue.js` — src/sync/syncQueue.js (~4258 tok)

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
