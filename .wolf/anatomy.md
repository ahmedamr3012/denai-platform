# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-23T17:59:03.061Z
> Files: 45 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `index.html` — denai — Clinical Insight (~110666 tok)
- `jsconfig.json` — Phase 20: IDE type-governance config; allowJs:true, checkJs:false (opt-in per file), noEmit:true; includes src/**/*.js + src/**/*.d.ts; no build coupling (~82 tok)
- `privacy.html` — Privacy Policy — denai (~2802 tok)
- `terms.html` — Terms of Service — denai (~3244 tok)

## .claude/


## .claude/rules/


## .github/workflows/

- `ci.yml` — CI regression suite; push/PR on main + wave6-hardening; runs engine + smoke tests via Playwright Chromium; actions @v5 (Node.js 24 runtime); project node-version: 20 (~41 tok)

## docs/

- `cloud-schema.md` — denai — Cloud Schema Design & Persistence Contracts (~5440 tok)

## notes/


## src/ai/

- `aiPayload.js` — ================================================================ (~1132 tok)
- `arabicLayer.js` — Phase 16 Arabic bilingual explanation layer; window.denaiArabic IIFE; localizeExpl(expl) maps all bounded engine text to Arabic; getLang/setLang/isArabic localStorage-backed lang state; PHRASES/FACTORS/TX_LABELS/CONF_PARTS maps + dynamic pattern matchers for score-embedded strings; no machine translation; pure computation (~4500 tok)
- `calcAI.js` — Pure AI scoring engine; calcAI() single-tooth; calcAIMulti() two-adjacent-tooth; bridge4 cost now reads getClinicPrice('bridge4') (R2.1 — no longer derived as bridge×1.3); no DOM access (~5500 tok)
- `clinicalEngine.js` — ClinicalEngine IIFE; 7-stage pipeline; normalize() costs object now includes overlay field (R2.1); restorativeCosts.slot1 uses c.costs.overlay for onlay cases instead of crown×0.65 (~8166 tok)
- `explainLayer.js` — Phase 14 explanation layer; window.denaiExplain IIFE; buildExplanation(ai) → {blocks, confidenceRationale, referralSignals}; typed blocks: classification/rationale/contraindication/escalation/tradeoff; confidence rationale for Medium/Low cases; specialist referral signals; pure derivation from existing ai result; Phase 20: JSDoc @param/@returns on buildExplanation() (~1997 tok)

## src/auth/

- `authModule.js` — Supabase auth lifecycle; signIn/signUp/signOut; session restore + onAuthStateChange; sidebar user area updates; Phase 8 flush() hooks; sign-out clears clinic session (which cascades to denaiEntitlements.clear()) (~2993 tok)
- `clinicSession.js` — Phase 3.4+13: clinic session context; init(client) loads clinic+role+subscription; getClinicId/Role/Name/isOwner/getMembers/getSubscriptionStatus/getPlanId; createClinic(name); _loadSubscription() calls denaiEntitlements.init() after clinic load; clear() cascades to entitlements (~2724 tok)
- `entitlements.js` — Phase 13 entitlement helper; window.denaiEntitlements; canUse(featureKey) plan-aware check (safe default: true when status unknown); isPro()/getStatus(); FEATURE_TIERS map (ai.enhanced/export.advanced/collab.advanced→'pro'); localStorage cache denaiSubscription_v1 (10min TTL); clear() preserves cache for offline grace; Phase 20: JSDoc on init(), canUse(), getStatus() (~1575 tok)

## src/constants/

- `clinicPrefs.js` — CLINIC_PREF_DEFAULTS, FDI_MAP, CURRENCY_CONFIG, TREATMENT_PRICING_CATALOG (16 entries: implant, bridge, bridge4, boneGraft, crown, overlay, rct, postCore, annualCheckup + R3.4 material add-ons: matZirconia $525, matEmax $0, matAllZirconia $360 + R3.5 treatment-scoped: matCrownZirconia $96, matCrownEmax $0, matOverlayCeramic $0, matOverlayComposite $0); all category:'material' entries flat absolute dollar add-ons, auto-rendered by settings modal (~2100 tok)
- `storageKeys.js` — Declares STORAGE_KEY (~52 tok)

## src/db/

- `schema.sql` — Production schema rev 6: profiles, patients, clinics, clinic_members, clinic_subscriptions (Phase 7+12: +stripe_customer_id, +stripe_event_at, upsert RPC; Phase 13: +member SELECT policy), workflow_observations; RLS, idempotent triggers, indexes (~11207 tok)

## src/observe/

- `frictionLog.js` — Phase 8 friction observation; IIFE module window.denaiObserve; record(eventType, flags?) to localStorage ring buffer (200 events); flush(supabaseClient) silent cloud upload; allowlisted types only, no PHI, per-page session_id; degrades offline (~1256 tok)

## src/onboarding/

- `guidanceModule.js` — Phase 9 operational confidence guidance; IIFE window.denaiGuidance; hasSeen(key)/markSeen(key) localStorage-backed seen-state tracker; no tour engine, no analytics; guidance rendering done by index.html render paths (~212 tok)

## src/react/

- `reactBridge.js` — src/react/reactBridge.js (~407 tok)
- `RiskPanel.js` — src/react/RiskPanel.js (~2652 tok)

## src/render/

- `aiCardPanel.js` — Phase 17/21/R1.1: AI card rendering cluster; buildAICardStructure() DOM template builder; #langToggle button removed (R1.1); setLang('en') resets persisted Arabic on card build; Arabic RTL path still active at renderAIExplanation time via denaiArabic; React island mount point #riskPanelMount (~5100 tok)
- `comparisonPanel.js` — Renders inline comparison table and full comparison table body; lazyRenderComparisonTable; renderComparison (~2000 tok)
- `costGraphPanel.js` — renderCost and renderGraph; cost breakdown and bar-chart visualization (~1800 tok)
- `materialPanel.js` — renderMaterial(state, ai): R3.5 treatment-scoped material UI; _getMatContext() derives 'implant'|'bridge'|'crown'|'overlay' from restorative slot id or state.tx; overlay branch (Ceramic/Composite Overlay); bridge branch uses clean "Zirconia Bridge"/"e.max Bridge" labels (no parentheticals); getCrownMaterial(state) unchanged — 3-case crown material logic (~1700 tok)
- `patientPanel.js` — renderPatientDisplay; patient demographics and condition summary panel (~1200 tok)
- `planFragments.js` — _getAiForPlan/buildTreatmentPathRows; treatment path HTML for Plan view; pure over parameters (~600 tok)
- `timeline.js` — _synthesizeWfBaseline/_renderWfTimeline; workflow timeline HTML builder; pure over patient/event parameters (~500 tok)
- `txCards.js` — Phase 17: Treatment card rendering; setCardScore score bar helper; renderTxCards dispatch; renderMultiTxCards (2-implant/bridge/cantilever); renderRestorativeTxCards (restorative slot labels); updateCrownCardState disabled/viable state; globals: $, S (~2320 tok)

## src/reports/

- `reportTemplates.js` — Shared report shell (rptShell), patient/risk/opt-card/reasons sections; R1.2: rptOptCard gains isSelected prop (✓ Selected badge); rptClinicianDecisionBanner() added (shown when clinician overrides AI rec); references BRAND/escapeHtml/isMaxilla from inline script (~2800 tok)

## src/styles/


## src/styles/components/


## src/styles/tokens/


## src/styles/utilities/

- `print.css` — Main-app print media queries: color-adjust, hide sidebar/topbar, opt-card.active winner styles; Phase 10 added print-color-adjust exact (~450 tok)

## src/sync/

- `cloudSync.js` — src/sync/cloudSync.js (~4670 tok)
- `prefsSync.js` — src/sync/prefsSync.js (~3196 tok)
- `serializer.js` — src/sync/serializer.js (~742 tok)
- `syncQueue.js` — src/sync/syncQueue.js (~4450 tok)

## src/types/

- `ai.d.ts` — Phase 20: AIFactor, CrownRisks, CalcAIResult (single-tooth), CalcAIMultiResult (two-tooth); raw scoring engine output shapes; global-scope .d.ts (~531 tok)
- `clinical.d.ts` — Phase 20: CaseType, CaseClass, TreatmentOption, ScoredTreatment, ExplanationSummary, NormalizedClinical, ClinicalAIResult, SingleMissingResult, MultiMissingResult, ProcessResult union, CompoundAIResult; ClinicalEngine pipeline contracts (~1121 tok)
- `explain.d.ts` — Phase 20: ExplanationBlockType, ExplanationBlock, ExplainResult; explanation layer output contracts; documents denaiExplain.buildExplanation() return shape (~300 tok)
- `globals.d.ts` — Phase 20: window-global module declarations; ClinicalEngine, calcAI, calcAIMulti, denaiAIPayload, denaiExplain, denaiArabic, denaiEntitlements, denaiSerializer, denaiObserve, denaiGuidance; IDE IntelliSense contract surface (~810 tok)
- `state.d.ts` — ================================================================ (~1018 tok)

## src/utils/

- `costEngine.js` — computeCosts(state, ai): 3-tier pricing chain; R3.5 restorative-mode gates: bridge material add-on blocked in restorative mode (!isRestorative), implant material blocked in overlay slot (isOverlaySlot); overlay slot uses overlayBase + matOverlayCeramic/matOverlayComposite add-ons; crown now uses absolute add-ons (matCrownZirconia $96 for cases 1&2, matCrownEmax $0 for case 3) replacing R3.3 percentages; selectedMaterial=null/primary → zero add-on (~2400 tok)

## supabase/functions/stripe-webhook/

- `index.ts` — Phase 12 Stripe webhook handler (Deno/Edge Function): signature verification, idempotent subscription lifecycle events via upsert_clinic_subscription() RPC, invoice period-end updates; retry-safe (5xx transient / 200 permanent), fast-ack unknown events (~2799 tok)

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
