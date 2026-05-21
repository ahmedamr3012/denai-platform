# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-21T06:07:56.188Z
> Files: 61 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `index.html` — denai — Clinical Insight (~111528 tok)
- `playwright.config.js` (~337 tok)
- `privacy.html` — Phase 3C-ii: standalone static privacy policy page. Self-contained HTML with trust.css + dark-mode flash prevention. Links to terms.html. (~2720 tok)
- `terms.html` — Phase 3C-iii: standalone static terms of service page. Mirrors privacy.html architecture. tp-is-not list for "what denai is not" section. Links to privacy.html. (~3150 tok)

## .claude/


## .claude/rules/


## .github/workflows/


## docs/

- `deployment-validation.md` — denai — Deployment Validation Playbook (~2691 tok)
- `privacy-policy.md` — denai — Privacy Policy (~1685 tok)
- `release-checklist.md` — denai — Release Checklist (~2015 tok)
- `terminology-governance.md` — Phase 3C-i: canonical term table, prohibited-phrase checklist, AI/workflow/privacy terminology rules, tone standard, review process (~3826 tok)
- `terms-of-service.md` — denai — Terms of Service (~1979 tok)

## notes/


## src/ai/

- `calcAI.js` — isPosteriorTooth: isMaxilla, isAdjacent, getAdjacentTeeth, calcAIMulti, calcAI (~8021 tok)
- `clinicalEngine.js` — ClinicalEngine: normalize, classify, generateTreatments, scoreRestorative (~8107 tok)

## src/auth/

- `authModule.js` — src/auth/authModule.js (~2327 tok)

## src/constants/

- `brand.js` — BRAND Object.freeze: name, displayName, tagline, disclaimer, footerLine, reportPrefix, exportPrefix (~80 tok)
- `brand.js` — Declares BRAND (~106 tok)
- `clinicalMaps.js` — BONE_MAP, HYGIENE_MAP, OCC_MAP, SMOKING_MAP, STRUCTURE_MAP, ENDO_MAP, PARAFUNCTION_MAP, DIABETES_MAP — dropdown option arrays (~120 tok)
- `clinicalMaps.js` — Declares BONE_MAP (~135 tok)
- `clinicPrefs.js` — Wave C1: CLINIC_PREF_DEFAULTS, FDI_MAP (Universal→FDI tooth map), CURRENCY_CONFIG (USD/EUR/CAD/EGP), TREATMENT_PRICING_CATALOG (7-entry registry: implant/bridge/boneGraft/crown/rct/postCore/annualCheckup). Pure constants, no side effects. (~250 tok)
- `storageKeys.js` — STORAGE_KEY, HISTORY_KEY, PATIENTS_KEY, ACTIVE_PT_KEY — localStorage key strings (~60 tok)
- `storageKeys.js` — Declares STORAGE_KEY (~51 tok)
- `toothPositions.js` — TOOTH_POSITIONS Object.freeze: cx/cy coords for all 32 teeth, used for dental chart SVG rendering (~200 tok)
- `toothPositions.js` — Declares TOOTH_POSITIONS (~208 tok)
- `uiConfig.js` — _VALID_VIEWS array, _TOPBAR_CFG per-view icon/title/sub config (~100 tok)
- `uiConfig.js` — Declares _VALID_VIEWS (~179 tok)
- `workflowStages.js` — _WF_STAGES array: 5 workflow stage config objects (id, icon, label) (~80 tok)
- `workflowStages.js` — Declares _WF_STAGES (~111 tok)

## src/db/


## src/render/

- `comparisonPanel.js` — Wave C2: renderComparison, lazyRenderComparisonTable, renderComparisonTable. All monetary display uses formatCurrency(). (~6720 tok)
- `costGraphPanel.js` — ================================================================ (~6807 tok)
- `patientPanel.js` — ================================================================ (~965 tok)
- `planFragments.js` — _getAiForPlan: _buildTreatmentPathRows (~794 tok)
- `riskPanel.js` — renderRisk: _applyRiskCompact (~1659 tok)
- `timeline.js` — _synthesizeWfBaseline: _renderWfTimeline (~447 tok)

## src/reports/

- `reportTemplates.js` — ── Shared report shell (header + CSS + footer wrapper) ───────── (~2302 tok)

## src/styles/

- `trust.css` — Phase 3C-iv: shared styles for privacy.html + terms.html. Self-contained CSS vars for light/dark mode (html.dark class + prefers-color-scheme). No dependency on app token files. (~1313 tok)

## src/styles/components/

- `cards.css` — Styles: 71 rules (~4250 tok)
- `diagnostics.css` — Styles: 23 rules (~1036 tok)
- `toast.css` — Styles: 5 rules (~294 tok)

## src/styles/tokens/

- `brand-tokens.css` — Styles: 14 vars (~206 tok)
- `focus-tokens.css` — Styles: 2 vars (~198 tok)
- `motion-tokens.css` — Styles: 5 vars (~223 tok)
- `shadow-tokens.css` — Styles: 10 vars (~295 tok)

## src/styles/utilities/


## src/sync/

- `cloudSync.js` — Wave 7E+7F+7G: `denaiCloudSync` IIFE. `hydrate()` selects `notes_enc`, decrypts before merge (`decryptedNotesMap` threaded through). Tombstone cleanup (Pass 3). Public API: hydrate, getLastHydratedAt. (~400 tok)
- `prefsSync.js` — src/sync/prefsSync.js (~3123 tok)
- `serializer.js` — src/sync/serializer.js. ALLOWED_FIELDS allowlist for cloud JSONB. Wave 4A: added 'serviceDate'. (~670 tok)
- `syncQueue.js` — src/sync/syncQueue.js (~3713 tok)

## src/utils/

- `betaObserver.js` — Beta observation layer — passive, zero render impact. (~900 tok)
- `caseHelpers.js` — _getPatientStageBadge: _getCaseUrgency, _getStalenessText, _wfEventLabel, _quickScore (~605 tok)
- `costEngine.js` — ── Literature-backed 10-year clinical constants ─────────────── (~1246 tok)
- `diagPanel.js` — Dev-only diagnostics panel — toggle with Ctrl+Shift+D. (~2248 tok)
- `formatters.js` — Wave C1+C4: formatTooth(tooth, compact?) — Universal '#8' or FDI '11 (#8)' dual display; compact=true for SVG. formatCurrency(), getCurrencySymbol(), getClinicPrice(), getToothSystemLabel(). All display-only, fallback-safe. (~950 tok)
- `notesEncryption.js` — Wave 7G: `denaiNotesEnc` IIFE. AES-GCM 256-bit client-side PHI encryption. PBKDF2 key derivation (100k iterations, SHA-256). Payload format: `{ v:1, iv:<b64>, ct:<b64> }`. Key lives in-memory only; cleared on sign-out. Public API: generateSalt, init, encrypt, decrypt, hasKey, clearKey. (~120 tok)
- `time.js` — _wfTimestamp (epoch ms → relative), _relativeTime (ISO string → relative), _newerTs (newer of two ISO strings) (~290 tok)

## tests/a11y/

- `runner.js` — tests/a11y/runner.js (~572 tok)

## tests/auth/

- `runner.js` — In-browser auth/enc runner: 12 scenarios (auth state×2, signout lifecycle×2, PBKDF2/AES-GCM crypto×6, PHI cloud safety×2) (~4026 tok)

## tests/ci/

- `accessibility.spec.js` — tests/ci/accessibility.spec.js (~1508 tok)
- `auth.spec.js` — CI gate: injects tests/auth/runner.js; adds auth-settle waitForFunction before runner (status≠'reconnecting') (~912 tok)
- `engine.spec.js` — tests/ci/engine.spec.js (~944 tok)
- `sync.spec.js` — CI gate: injects tests/sync/runner.js, runs DenaiSyncRunner.runAll() (11 scenarios: serializer×5, queue×4, tombstone×1, placeholder×1) (~784 tok)

## tests/e2e/

- `multidevice.spec.js` — CI gate: injects tests/e2e/runner.js; adds auth-settle waitForFunction before runner (same pattern as auth.spec.js) (~881 tok)
- `runner.js` — In-browser multi-device simulation runner: 7 scenarios (cross-device hydration×1, tombstone propagation×1, offline queue×1, reconnect flush×1, conflict LWW cloud-wins×1, conflict LWW local-wins×1, encryption continuity×1) (~600 tok)

## tests/engine/

- `scenarios.js` — ================================================================ (~9594 tok)

## tests/smoke/


## tests/sync/

- `runner.js` — In-browser sync runner: 11 regression scenarios for serializer allowlist, syncQueue lifecycle (enqueue/dedup/hasPendingFor/softDelete), tombstone removal (mocked hydrate + NoPendingQueueStub), placeholder protection (~4676 tok)
