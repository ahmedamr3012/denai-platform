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
- **`'unsafe-eval'` was unnecessary and has been removed (Wave 6C.1A):** Full grep of all JS files and inline script confirmed zero `eval()`, `new Function()`, or string-based `setTimeout`/`setInterval`. Do not re-add without a confirmed runtime requirement.
- **`blob:` URLs used in 4 features — all currently CSP-gapped:** (1) report popup `window.open(blobUrl)`, (2) JSON export download link, (3) PWA manifest built dynamically in JS, (4) SW registration. None covered by `default-src 'self'`. Fix in a future wave by adding `blob:` to `default-src`.
- **Service Worker cache name `dandy-v1` is a copy-paste relic:** SW code at `index.html` ~line 3557 hardcodes `const CACHE = 'dandy-v1'` (old project name). If SW is ever enabled, update to `denai-v2.x` first or it creates an unbusted cache trap.

- **Wave 7C cloud schema: `state` JSONB excludes `notes` and `activeSite`:** The Wave 7D serializer must strip both before upload. `notes` = PHI (deferred to Wave 7G encryption). `activeSite` = device-local navigation state (meaningless on another device). Omitting from JSONB causes `{ ...DEFAULT_STATE, ...stateFromCloud }` to restore `activeSite = 1` correctly.
- **Patient IDs are the cloud PK — format is frozen:** `p_<timestamp>_<random>` maps to `text PRIMARY KEY` in the `patients` table. Changing this format after Wave 7D would break all existing cloud rows.
- **History is embedded in the `patients.history` JSONB column (not a separate table):** Capped at 50 entries, append-only, per-patient. Separate table adds complexity for no gain at current scale.
- **`notes_enc` column exists but is NULL until Wave 7G:** The schema reserves the column. Do not populate it before client-side AES-GCM encryption is implemented. Key management design must precede Wave 7G.

- **Wave 7B auth initializes AFTER render(S) via `denaiAuth.init()` at end of `init()`:** Auth is purely additive. The call is `denaiAuth.init().catch(() => {})` — never throws. All auth failures silently degrade to local mode. localStorage clinical data is NEVER touched by auth operations.
- **Supabase CDN global is `window.supabase` (not `window.Supabase`):** The UMD bundle from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2.x/dist/umd/supabase.js` exposes `window.supabase = { createClient: ... }`. Reference it as `window.supabase.createClient(url, key)`.
- **Auth placeholder credentials cause graceful local-mode fallback:** `placeholder.supabase.co` will fail client init. `_getClient()` returns `null`, `_restoreSession()` catches and calls `_setStatus('local')`. App continues normally. Replace with real credentials to activate cloud.
- **Versioned asset count is now 30 (not 29):** Wave 7B added `src/auth/authModule.js?v=2.0.0`. Release checklist grep count updated to 30.

- **Wave 7D sync queue uses explicit upsert deduplication:** When a new upsert for the same `patient_id` arrives, the old queued upsert is replaced (filter+push). The newest payload is always correct; stale queued upserts are wasteful.
- **Wave 7D soft-delete enqueue must happen BEFORE localStorage filter:** `enqueueSoftDelete(_pendingDeleteId)` is called in `confirmDeletePatient()` before `list.filter(...)` — the patient ID must still exist in-scope when the op is enqueued.
- **Wave 7D flush triggers: both `_restoreSession` AND `_listenAuthChanges` need flush calls:** `getSession()` does not fire `onAuthStateChange` (SIGNED_IN event) — so a returning user whose session is restored via `getSession()` would never flush the queue without the explicit `setTimeout(() => denaiSyncQueue.flush(), 0)` in `_restoreSession`.
- **Wave 7D sync status display shares `#authUserPlan` with authModule:** `syncQueue._setStatus()` guards with `denaiAuth.isSignedIn()` before writing. authModule owns the element in local mode; syncQueue owns it only when signed in. Occasional text flip during token refresh is cosmetic only.
- **Wave 7D `denaiAuth.getClient()` is the single Supabase client for DB ops:** syncQueue uses `denaiAuth.getClient()` rather than creating a second client. Two clients with the same credentials would share auth session but could cause double token-refresh races.
- **Wave 7D versioned asset count is now 32 (not 30):** 19 CSS + 13 JS (serializer.js + syncQueue.js added). Release-checklist grep count updated to 32. Deployment-validation total requests updated to 33.
- **Wave 7D history is included in upsert payload but synced opportunistically:** `History.load(S.id)` is called inside saveState's debounce. History changes alone (no state change) do not trigger a cloud sync in 7D. Wave 7E concern.
- **Wave 7D upsert `updated_at` is overridden by server trigger on UPDATE:** The `touch_updated_at()` trigger sets `updated_at = now()` on the server for any UPDATE (including upsert conflict resolution). Client-provided `updated_at` is used for INSERT only. This makes last-write-wins conflict detection unavailable for Wave 7D — deferred to Wave 7E.

- **Wave 7E `_syncedAt` is local-only metadata on each patient object:** It holds the cloud `updated_at` ISO string from the last time that patient was received from Supabase. It is NOT in `ALLOWED_FIELDS` (serializer strips it). It persists in localStorage alongside the patient and is used by `cloudSync._mergeOne()` as the merge baseline. Never treat it as clinical data.
- **Wave 7E `hasPendingFor(patientId)` guards against cloud overwriting in-flight local edits:** If a patient has an unsent upsert in the queue (edited locally but not yet flushed), the merge engine keeps local unchanged even if cloud claims to be newer. This protects the "offline edit then come online" scenario.
- **Wave 7E `denaiApplyCloudMerge` MUST be a function declaration (not const) in the inline script:** cloudSync.js is a separate classic-script file. It can only access top-level function declarations from the inline script via window.* — `const`/`let` top-level vars are not on window. `denaiApplyCloudMerge` needs access to `S`, `UIState`, `DEFAULT_STATE` — all `const` in inline scope — so it must live IN the inline script and be exposed as a function declaration.
- **Wave 7E `_isPlaceholder()` prevents uploading the default 'Mohamed A.' seed patient to cloud:** A patient is a placeholder if: name === 'Mohamed A.' AND no `_syncedAt` (never came from cloud) AND no history entries. This avoids polluting new device accounts with a meaningless default record.
- **Wave 7E merge passes history only when cloud wins:** `_saveHistory()` is called only when `merged !== local` (cloud version replaced local). If local wins (unchanged), local history is preserved and NOT overwritten by possibly-older cloud history.
- **Wave 7E versioned asset count is now 33 (not 32):** 19 CSS + 14 JS (cloudSync.js added). Release-checklist grep count updated to 33. Deployment-validation total requests updated to 34.
- **Wave 7E `render` and `buildEditForm` ARE accessible from external script files:** They are function declarations at the top level of the inline `<script>` block. The 2-space indentation is stylistic only — JavaScript scope is not affected by indentation. `const`/`let` at the same indentation level are still NOT on window.

## Do-Not-Repeat

- [2026-05-15] **`const`/`let` top-level classic-script declarations are NOT `window.*` properties.** In Playwright (and in browsers), `window.X` only resolves for `var` declarations and `function` declarations at script top level. `const ClinicalEngine = ...` makes `ClinicalEngine` available in the global scope but NOT as `window.ClinicalEngine`. Use `typeof X !== 'undefined'` (not `window.X`) when checking for `const`/`let` globals in `page.waitForFunction` or `page.evaluate`. For CI test sentinels, prefer a known function declaration (`window.render`) over `const` globals.



<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-05-14] **Dual-definition pattern is ONLY safe for `function` declarations, not `const`/`let`.** `function` declarations hoist and silently overwrite; `const`/`let` at top-level of a classic script cannot be re-declared — a second `const X` in the inline script block throws `SyntaxError: Identifier 'X' has already been declared` at parse time, crashing the entire app. For modules containing `const`/`let` globals, collapse Steps B+C into a single atomic operation: insert script tag and remove inline declarations in the same edit session, with no intermediate state.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-05-14] **setState Tier-1 migration (Wave 3.8.1).** Four bypass paths routed through setState(): (1) `selectTx()` multiTooth branch — was `S.tx = option; saveState()`, (2) `applyAIRec()` — was `S.tx = recTx; saveState()`, (3) `whatIfApply` click — was `Object.assign(S, {8 fields}); saveState()`, (4) `_handleNotesInput` — was `S.notes = …; saveState()`. Pattern: remove the explicit `saveState()` call alongside the direct mutation — setState() includes it internally. Intentional exceptions NOT migrated: `switchSite()` (activeSite must not persist), `switchPatient()` / `confirmReset()` (wholesale replacement, not patch), `saveEdit()` BUG#3 correction (post-setState AI check), site2/multiTooth routing handlers (fields absent from StateValidator).

- [2026-05-14] **UIState separation pattern (Wave 3.7.2).** `editing`, `whyOpen`, `historyOpen` moved from `S` to a standalone `UIState` object with a `setUIState(patch)` helper. Three-step sequence: (A) add UIState + setUIState without touching S, (B) migrate all mutation and read sites to UIState (including inline DOM reads within the same toggle functions — must migrate together or DOM breaks), (C) remove stale fields from S init, saveState() destructure, and switchPatient() Object.assign. `activeSite` deliberately left in S — it is a render-routing parameter, not a pure UI flag. `saveState()` destructure was simplified from `const { editing, whyOpen, historyOpen, ...serializable } = S` to `const serializable = { ...S }` since the fields are no longer in S. Persistence boundary is now structural (UIState never reaches saveState()) rather than convention-based (strip list).
