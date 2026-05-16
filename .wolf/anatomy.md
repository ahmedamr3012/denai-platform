# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-16T14:33:10.068Z
> Files: 18 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `index.html` — denai — Clinical Insight (~94596 tok)
- `playwright.config.js` (~337 tok)

## .claude/


## .claude/rules/


## .github/workflows/


## docs/

- `deployment-validation.md` — denai — Deployment Validation Playbook (~2691 tok)
- `release-checklist.md` — denai — Release Checklist (~2001 tok)

## notes/


## src/ai/


## src/auth/

- `authModule.js` — src/auth/authModule.js (~2328 tok)

## src/db/


## src/render/


## src/reports/


## src/styles/components/

- `toast.css` — Styles: 5 rules (~294 tok)

## src/styles/tokens/

- `motion-tokens.css` — Styles: 5 vars (~223 tok)

## src/styles/utilities/


## src/sync/

- `cloudSync.js` — Wave 7E+7F+7G: `denaiCloudSync` IIFE. `hydrate()` selects `notes_enc`, decrypts before merge (`decryptedNotesMap` threaded through). Tombstone cleanup (Pass 3). Public API: hydrate, getLastHydratedAt. (~400 tok)
- `prefsSync.js` — Wave 7F+7G: `denaiPrefs` IIFE. Wave 7G adds `notesKeySalt` to prefs; `_triggerPassphrasePrompt()` calls `window.denaiShowNotesPassphrasePrompt`. Public API: init, get, save, hydrate. (~200 tok)
- `serializer.js` — src/sync/serializer.js (~627 tok)
- `syncQueue.js` — Wave 7D–7G: `denaiSyncQueue` IIFE. Stores `rawNotes` at enqueue; encrypts via `denaiNotesEnc` at flush, adds `notes_enc` as top-level upsert column. Public API: init, enqueue, enqueueSoftDelete, flush, hasPendingFor, getStatus, getQueueLength, getLastSyncedAt. (~480 tok)

## src/utils/

- `notesEncryption.js` — Wave 7G: `denaiNotesEnc` IIFE. AES-GCM 256-bit client-side PHI encryption. PBKDF2 key derivation (100k iterations, SHA-256). Payload format: `{ v:1, iv:<b64>, ct:<b64> }`. Key lives in-memory only; cleared on sign-out. Public API: generateSalt, init, encrypt, decrypt, hasKey, clearKey. (~120 tok)

## tests/auth/

- `runner.js` — In-browser auth/enc runner: 12 scenarios (auth state×2, signout lifecycle×2, PBKDF2/AES-GCM crypto×6, PHI cloud safety×2) (~4026 tok)

## tests/ci/

- `auth.spec.js` — CI gate: injects tests/auth/runner.js; adds auth-settle waitForFunction before runner (status≠'reconnecting') (~912 tok)
- `sync.spec.js` — CI gate: injects tests/sync/runner.js, runs DenaiSyncRunner.runAll() (11 scenarios: serializer×5, queue×4, tombstone×1, placeholder×1) (~784 tok)

## tests/e2e/

- `multidevice.spec.js` — CI gate: injects tests/e2e/runner.js; adds auth-settle waitForFunction before runner (same pattern as auth.spec.js) (~881 tok)
- `runner.js` — In-browser multi-device simulation runner: 7 scenarios (cross-device hydration×1, tombstone propagation×1, offline queue×1, reconnect flush×1, conflict LWW cloud-wins×1, conflict LWW local-wins×1, encryption continuity×1) (~600 tok)

## tests/engine/


## tests/smoke/


## tests/sync/

- `runner.js` — In-browser sync runner: 11 regression scenarios for serializer allowlist, syncQueue lifecycle (enqueue/dedup/hasPendingFor/softDelete), tombstone removal (mocked hydrate + NoPendingQueueStub), placeholder protection (~4676 tok)
