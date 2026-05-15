# denai — Runtime Contracts & Architecture Freeze
> Post-Wave-5 stabilization snapshot. Created: 2026-05-15. Branch: wave5-hardening.

---

## 1. Runtime Architecture Overview

denai is a single-page clinical decision support app delivered as a classic-script HTML bundle (`index.html`). There is no module system. All JavaScript executes as top-level classic-script functions or inside a single master IIFE; globals are accessible by name across `<script src="...">` tags loaded in document order.

### Layer Stack (dependency direction: top depends on bottom)

```
┌─────────────────────────────────────────────────────┐
│  5. Regression Infrastructure                       │
│     tests/engine/runner.js · tests/smoke/runner.js  │
├─────────────────────────────────────────────────────┤
│  4. Render Layer                                    │
│     src/render/*.js · updateAICard (inline)         │
├─────────────────────────────────────────────────────┤
│  3. Orchestration Kernel (FROZEN)                   │
│     render() · renderMainPanels() · updateAICard()  │
├─────────────────────────────────────────────────────┤
│  2. Computation Layer                               │
│     src/ai/clinicalEngine.js · src/ai/calcAI.js     │
│     src/utils/costEngine.js                         │
├─────────────────────────────────────────────────────┤
│  1. State Layer                                     │
│     S · UIState · tempState · localStorage          │
└─────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | What it must NOT do |
|---|---|---|
| State | Own persisted and ephemeral app state | Trigger renders directly |
| Computation | Pure functions: classify → score → recommend | Read DOM, read S, produce side-effects |
| Orchestration Kernel | Single render entrypoint; sequence + dispatch | Be modularized further without full audit |
| Render Layer | Write DOM from (state, ai) parameters | Read global S; own ai computation |
| Regression | Validate engine + render surface | Mutate S, setState, localStorage |

---

## 2. Frozen Orchestration Kernel

### RED ZONE — these three functions must not be refactored without a full audit.

#### `render(state = S)`
Single render entrypoint. Accepts an optional state override (used for what-if/preview).

```
render(state)
  ├─ compound path: state.multiSite && state.site2Tooth
  │    └─ ClinicalEngine.processCompound(state) → compound
  │         compound.site1 may be null; compound.site2 may be null
  │         activeSite (1 or 2) selects ai for renderMainPanels
  └─ single path: ClinicalEngine.process(state) → ai (nullable)
       └─ renderMainPanels(state, ai)
```

**Why frozen:** Touching `render()` risks breaking the compound/single dispatch boundary, the state override mechanism (`tempState`), and the EB topology.

#### `renderMainPanels(state, ai)`
Sequences all 6 panel renders inside `withErrorBoundary` wrappers.

```
renderMainPanels(state, ai)
  1. withErrorBoundary → renderPatientDisplay(state)
  2. withErrorBoundary → renderTxCards + buildAICardStructure
                       + updateAICardMulti | updateAICard
                       + renderRisk(state, ai)
                       + if (ai) renderReasons(ai.reasons, ai.factors)
                       + else showSkeleton
  3. withErrorBoundary → renderComparison(state, ai)
  4. withErrorBoundary → renderMaterial(state)
  5. withErrorBoundary → renderCost(state, ai) + renderGraph(ai)
  6. withErrorBoundary → lazyRenderComparisonTable(state, ai)
```

**Why frozen:**
- Sequencing is load-bearing. `buildAICardStructure()` must run before `updateAICard()`. `renderTxCards` selects the active option before the AI card reads it.
- EB topology is load-bearing. Each EB boundary is matched to a specific DOM container. Moving panels between boundaries changes crash isolation.
- `ai` is nullable throughout — every panel must tolerate null ai without blowing up.

#### `updateAICard(ai)`
Populates the AI confidence ring, success rate, and reasons panel for single-tooth and restorative paths. Reads `rateMap` keyed by `ai.rec` to select the appropriate display rate. `ai.isMultiTooth` routes to `updateAICardMulti` instead — never call `updateAICard` with a multi-tooth ai.

**Why frozen:** Ring SVG mutation, `animateNumber` RAF scheduling, and the `rateMap` lookup all interlock. The function also branches on `ai.conf` and `displayRate` finite-number guards (P3A/P3B).

---

## 3. AI Shape Contracts

`ClinicalEngine.process(state)` returns one of four ai shapes, or `null`.

### Contract: single-tooth surgical ai (`treatmentMode: 'single'`)

| Field | Type | Guarantee |
|---|---|---|
| `implant` | number | clamped [50, 99], always finite |
| `bridge` | number | clamped [50, 95], always finite |
| `crown` | number | clamped [60, 97] if crownViable; else 0 |
| `conf` | number | clamped [35, 95], integer, always finite |
| `rec` | string | one of `'implant'` / `'bridge'` / `'crown'` |
| `recDisplay` | string | human-readable treatment name |
| `reasons` | string[] | non-empty array |
| `factors` | object[] | may be empty array |
| `peri` / `boneR` / `occR` / `smokingR` | string | one of `'Low'` / `'Medium'` / `'High'` |
| `crownViable` | boolean | present |
| `crownRisks` | object | present if crownViable; undefined otherwise |
| `treatmentMode` | `'single'` | always |

**Forbidden assumptions:** Do NOT access `ai.implant2`, `ai.bridge4`, `ai.cantilever`, `ai.costs`, `ai.scored`.

### Contract: restorative ai (`treatmentMode: 'restorative'`)

| Field | Type | Guarantee |
|---|---|---|
| `rec` | string | slot key (`'implant'` / `'bridge'` / `'crown'`) |
| `recDisplay` | string | human-readable (e.g., `'Onlay / Overlay'`, `'Endocrown'`) |
| `scored` | object[] | array of scored treatment options with `{id, slot, score}` |
| `crownRisks` | object | always present (restorative path has viable tooth) |
| `treatmentMode` | `'restorative'` | always |

**Key asymmetry:** `ai.rec` is a slot key; `ai.recDisplay` is the display string. They are not interchangeable. Restorative rec will map to `'crown'` slot, but recDisplay will be the specific restorative sub-type.

**Forbidden assumptions:** Do NOT expect `ai.peri`, `ai.boneR`, `ai.occR` (these are implant-specific risk fields).

### Contract: multi-tooth ai (`isMultiTooth: true`, `treatmentMode: 'multi'`)

| Field | Type | Guarantee |
|---|---|---|
| `implant2` | number | clamped [50, 99], always finite |
| `bridge4` | number | clamped [50, 95], always finite |
| `cantilever` | number | clamped [40, 90], always finite |
| `rec` | string | one of `'implant2'` / `'bridge4'` / `'cantilever'` |
| `costs` | object | always present — `{ implant2, bridge4, cantilever }` — all numbers |
| `isMultiTooth` | `true` | always |
| `treatmentMode` | `'multi'` | always |

**Forbidden assumptions:** Do NOT access `ai.implant`, `ai.bridge`, `ai.crown`, `ai.peri`, `ai.boneR`, `ai.crownRisks`. These fields do not exist on multi-tooth ai.

**`ai.costs` contract:** Present and complete when `isMultiTooth === true`. The `if (!mtCosts) return;` guard in `renderCost` is a belt-and-suspenders check — `calcAIMulti` always constructs `costs` before returning.

### Contract: compound ai

Returned by `ClinicalEngine.processCompound(state)` when `state.multiSite && state.site2Tooth`.

```javascript
{
  isCompound: true,
  site1: ai | null,   // single-tooth or restorative ai for site 1
  site2: ai | null,   // may be null if site 2 state is invalid
}
```

`processCompound` returns `null` only if both `site1` and `site2` are null.

**Routing in `render()`:** `activeSite` (1 or 2) selects which ai is passed to `renderMainPanels`. When `activeSite === 2` and `compound.site2 === null`, `ai` arrives at `renderMainPanels` as `null`. All panels tolerate null ai after Wave 5.2A hardening.

**Known limitation (D-1):** When `compound.site2 === null`, panels render in their null-ai fallback state (skeletons, empty panels) without a user-visible error message distinguishing "site 2 is empty" from "site 2 is computing." This is accepted behavior; correcting it would require orchestration changes.

---

## 4. State Ownership Contracts

### `S` — persisted application state

```javascript
const S = (() => {
  const loaded = { ...loadState() };  // hydrates from localStorage
  return loaded;
})();
```

- **Persistence:** `saveState()` serializes S to `localStorage`. Every mutation must go through `setState(patch)`, which calls `saveState()` internally.
- **Forbidden patterns:** Direct field assignment (`S.tx = 'implant'`) without a subsequent `saveState()` call. Exception: handlers that have been explicitly opted out (see Decision Log 2026-05-14).
- **Does not contain:** `editing`, `whyOpen`, `historyOpen` — these were moved to `UIState` (Wave 3.7.2). `activeSite` is in S because it is a render-routing parameter, not a pure UI flag.

### `UIState` — ephemeral UI flags

```javascript
const UIState = { editing: false, whyOpen: false, historyOpen: false };
function setUIState(patch) { Object.assign(UIState, patch); }
```

- **Persistence:** Never persisted. Reset to defaults on page load.
- **Forbidden patterns:** Adding fields that should survive navigation or patient switch. Adding render-routing state that affects ClinicalEngine inputs.

### `tempState` — what-if preview state

```javascript
let tempState = { ...S };
```

- **Usage:** Shallow clone of S for what-if/preview mode. Passed to `render(tempState)` without committing to S.
- **Forbidden patterns:** Mutating S through tempState. Treating tempState as authoritative after a patient switch.

### No-S-read render invariant

All panel modules in `src/render/` (`riskPanel.js`, `costGraphPanel.js`, `patientPanel.js`, `materialPanel.js`, `comparisonPanel.js`) receive state as a function parameter and do not read the global `S`.

**Intentional exception:** `renderMultiTxCards()` in `index.html` reads `S.tx` directly to determine the active treatment card. This is the only known violation of the no-S-read invariant in the render layer. It is intentional and documented here.

---

## 5. Render Layer Contracts

### Panel ownership model

Each panel function owns exactly one DOM container. Cross-container writes are forbidden.

| Function | Container | Notes |
|---|---|---|
| `renderPatientDisplay` | `#infoDisplay` | |
| `renderTxCards` + `updateAICard` | `#aiCardBody` | Both share the container inside one EB block |
| `renderComparison` | `#compInlineTable` | |
| `renderMaterial` | `#matPrimary` | |
| `renderCost` + `renderGraph` | `#costContainer` | Both share the container inside one EB block |
| `lazyRenderComparisonTable` | `#comparisonTableBody` | IntersectionObserver — deferred first render |

### `withErrorBoundary(fn, containerId, label)`

Wraps a panel render function. On throw: logs `[denai EB] <label>: <err>` to console, replaces `#containerId` innerHTML with `.card-error-fallback`. Prevents one panel's crash from cascading.

**Contract:** The wrapped function must be synchronous. `withErrorBoundary` does not handle promise rejections. Do not wrap async functions.

### Fail-soft expectations

Panels are expected to render a degraded state (skeleton, empty, or nominal display) when `ai` is null — not throw. The `withErrorBoundary` wrapper is a last resort; it should not be the primary null-ai handler.

Guards installed by Wave 5.2A:
- `renderRisk`: returns immediately if `!ai` (P1)
- `renderGraph`: shows empty state if `!ai`; returns immediately if NaN coordinates (P2)
- `updateAICard`: guards `ai.conf` finite before ring dashoffset (P3B); guards `displayRate` finite before `.toFixed(1)` (P3A)
- `renderReasons`: returns immediately if `!Array.isArray(list)` (P4)
- `renderCost`: returns immediately if `!mtCosts` in multi-tooth branch (D-2)

### Parameter discipline

All panel functions accept `(state, ai)` or `(ai)` as explicit parameters. They must not reach for S, UIState, or tempState. DOM IDs used inside panel functions must be within the panel's owned container — cross-container DOM reads using `$()` are acceptable for reading (e.g., reading a toggle state), but writes must stay within the owned container.

---

## 6. Runtime Guard Philosophy

### Early-return philosophy

All guards in the render layer are early-return guards. No guard alters data or falls back to a default value mid-function. If a precondition fails, the function returns immediately, leaving the DOM in its previous state (stale but not corrupt).

**Rationale:** Stale DOM is recoverable (next render() call will update it). Corrupt DOM (partial write with NaN values injected into SVG coordinates) is not.

### Finite-number guards

NaN propagates silently through arithmetic in JS. `Math.max(65, NaN) === NaN` — counter-intuitive. Guards using `Number.isFinite()` are required before:
- SVG coordinate calculations (`renderGraph` P2)
- `.toFixed()` calls (P3A)
- `stroke-dashoffset` attribute writes (P3B)

### Fail-soft rendering

A panel that fails silently (returns early, renders skeleton, shows empty state) is preferred over a panel that throws. `withErrorBoundary` is a safety net for the unexpected — not a design goal. Well-guarded panels should never reach the EB catch.

### When NOT to guard

Do not add defensive guards against scenarios that cannot occur given upstream contracts. Specifically:
- `calcAI` / `calcAIMulti` clamp all numeric outputs before returning — no finite-number guard is needed on those values in downstream render code.
- `ai.costs` is always constructed by `calcAIMulti` — the `!mtCosts` guard is belt-and-suspenders, not a real risk.
- Do not add `ai?.implant ?? 0` fallbacks — if `ai.implant` is missing, it signals a shape contract violation, and the correct response is an early return, not a silent substitution.

### Intentional tolerance zones

- `renderGraph` returns early for `isMultiTooth` and `treatmentMode === 'restorative'` — the SVG graph is single-tooth surgical only. The stale SVG from a prior render persists; this is accepted.
- `_applyRiskCompact()` inspects `.risk-val` text content for 'high'/'medium' strings — fragile but intentional. A change to risk label strings must be coordinated with this function.

---

## 7. Regression Infrastructure

### Wave 5.1B — Engine Regression Runner

**Files:** `tests/engine/runner.js`, `tests/engine/scenarios.js`

**What it validates:**
- `ClinicalEngine.process()` and `ClinicalEngine.processCompound()` produce correct outputs for 9 deterministic scenarios
- Assertion types: `eq` (exact), `finite` (not NaN/Infinity), `range` ([min, max]), `minLen` (array length), `notNull`, `noNaN`
- Scenarios: implant-good-bone, bridge-fair-bone, smoker-implant, diabetic-uncontrolled, poor-bone-implant, restorative-viable, restorative-hopeless, multi-tooth-two-implants, compound-two-sites

**What it intentionally does NOT validate:**
- DOM state after render
- Animation completion
- Comparison table content
- Material selection display
- Cost calculation accuracy (tested by engine assertions on scores, not DOM)

**Deterministic guarantees:** Uses frozen state copies. Never mutates S, calls setState, touches localStorage, or reads DOM. Pure engine IO.

**API:** `DenaiEngineRunner.runAll()` / `DenaiEngineRunner.runOne(id)`

### Wave 5.1C-0 — DOM Smoke Runner

**Files:** `tests/smoke/runner.js`

**What it validates (Tier 1 synchronous-only):**
- No EB errors fired during render
- No card-error-fallback elements present
- `#infoDisplay` populated
- `#costContainer` populated
- `#recBanner` populated
- Confidence ring `stroke-dashoffset` set (not undefined)
- `#confVal` set
- `#successBar` width set
- Risk section visible
- Graph SVG present
- Active tx card present
- 3 scenarios: smoke-implant, smoke-bridge, smoke-restorative-viable

**What it intentionally does NOT validate:**
- Async animation completion (animateNumber RAF)
- IntersectionObserver-gated comparison table (lazyRenderComparisonTable)
- Exact numeric values inside DOM elements
- Dark mode rendering

**Known limitation:** Tier 1 assertions fire synchronously after `render()`. RAF-based animations (`animateNumber`, ring dashoffset) have not yet completed at assertion time. Values shown in DOM at smoke-test time may be the initial/previous values, not the final animated targets.

**API:** `DenaiSmokeRunner.runAll()` / `DenaiSmokeRunner.runOne(id)`

---

## 8. Technical Debt Classification

### Intentional debt

| Item | Location | Rationale |
|---|---|---|
| LONGEVITY onlay inconsistency | `comparisonPanel.js` | `renderComparison` shows '10–15 yrs'; `renderComparisonTable` shows '8–15 yrs'. Two separate render paths, preserved deliberately — harmonizing requires clinical review, not just a code change. |
| `renderMultiTxCards` reads global S.tx | `index.html` | Active tx selection is a transient UI concern; passing it through every render call would require threading state through the call chain. Accepted as the sole no-S-read exception. |

### Acceptable debt

| Item | Location | Notes |
|---|---|---|
| Hardcoded RGB in shadow/focus tokens | CSS token files | `--shadow-brand`, `--focus-ring`, scrollbar thumbs hardcode `31,122,79` / `42,156,103` RGB. Will drift on palette change. Documented in `cerebrum.md`. |
| `body{}` hardcodes `'DM Sans'` directly | `index.html` inline `<style>` | Pre-existing. Typography token `--font-body` exists but body rule doesn't use it. Low risk. |
| `_applyRiskCompact` reads text content | `riskPanel.js` | String-sniff for 'high'/'medium'. Fragile but stable — label strings have not changed across the project's lifetime. |

### Dangerous debt (D-series — partially closed)

| ID | Item | Status |
|---|---|---|
| D-1 | `compound.site2 === null` passed as `ai` to `renderMainPanels` | Open — panels render in null-ai fallback without distinguishing "empty" from "error" |
| D-2 | `ai.costs` unguarded in `renderCost` multi-tooth branch | Closed (Wave 5.2A-5) |

### Deferred debt (Df-series)

| ID | Item | Notes |
|---|---|---|
| Df-1 | Wave 5.1C-1 test hooks | `window.__denaiTestHooks` not yet wired; blocks Tier 2 async smoke assertions |
| Df-2 | Tier 2 async smoke assertions | Requires Df-1; tests animateNumber + ring dashoffset completion |
| Df-3 | `reportTemplates.js` test coverage | No regression assertions on report template output |
| Df-4 | Comparison full-table content assertions | Smoke runner asserts container exists, not content correctness |

### Cosmetic debt

- `src/styles/` token coupling notes (documented in `cerebrum.md` and `anatomy.md`)
- Inline `<style>` block remains large; Wave 1–2 CSS extraction reduced it but did not eliminate it

---

## 9. Frozen Boundaries

### Stable — no changes without full audit

- `render()` — orchestration entrypoint
- `renderMainPanels()` — panel sequencing and EB topology
- `withErrorBoundary()` — error isolation boundary
- `ClinicalEngine.process()` / `ClinicalEngine.processCompound()` — AI computation contracts
- `calcAI()` / `calcAIMulti()` — score clamping guarantees
- `computeCosts()` — cost calculation
- State layer (`S` / `UIState` / `tempState`) — ownership and persistence contracts

### Allowed future iteration (with appropriate scope)

- `src/render/` panel modules — new guard additions, display improvements, content fixes
- `src/styles/` CSS token files — token additions, color refinements
- `tests/` — new scenarios, Tier 2 assertions (pending Df-1)
- `docs/` — documentation updates

### Forbidden from casual refactor

- `renderMainPanels` EB topology — container IDs, panel order, which panels share EB blocks
- `buildAICardStructure()` / `updateAICard()` / `updateAICardMulti()` — AI card DOM lifecycle; `dataset.built` guard is load-bearing
- `setState()` / `saveState()` / `loadState()` — persistence layer
- `animateNumber()` / `_rafIds` — animation scheduling; any change requires verifying RAF cancellation on re-render

---

## 10. Post-Wave-5 Status

### What Wave 5 achieved

**Wave 5.1B** — Deterministic engine regression runner. 9 scenarios covering all 4 AI shapes. Zero DOM dependencies. Prevents silent regression in ClinicalEngine computation paths.

**Wave 5.1C-0** — DOM smoke runner. 3 render scenarios. Tier 1 synchronous assertions on 12 DOM targets. Confirms render pipeline completes without EB fires for canonical inputs.

**Wave 5.2A (guards P1–P4 + D-2)** — 6 targeted null/NaN guards in render layer. Eliminates crash vectors for: null ai in riskPanel, NaN SVG coordinates in renderGraph, NaN `.toFixed()` in updateAICard, NaN ring dashoffset in updateAICard, non-array reasons list in renderReasons, missing costs object in renderCost multi-tooth branch.

**Wave 5.3A** — Read-only runtime contracts recon. Identified D-1/D-2 dangerous debt, formalized AI shape contracts, confirmed no-S-read invariant, documented guard philosophy.

**Wave 5.3B** — This document. Architecture snapshot and freeze documentation.

### Current platform maturity

The computation layer (ClinicalEngine, calcAI, computeCosts) is stable with strong numeric clamping contracts. The render layer is hardened against null/NaN inputs. The orchestration kernel is frozen and documented. Regression infrastructure covers the engine tier and render surface tier synchronously.

### Readiness for Wave 6

The platform is ready for Wave 6 infrastructure work. The freeze documentation provides clear boundaries. Before beginning Wave 6:
- Confirm D-1 (compound site2 null handling) is acceptable for Wave 6 scope
- Wave 5.1C-1 (test hooks) is a prerequisite for meaningful Tier 2 async regression coverage
- Any Wave 6 changes to `renderMainPanels`, `render()`, or EB topology require explicit documentation update

### Remaining architectural risks

| Risk | Severity | Notes |
|---|---|---|
| D-1: compound.site2 null | Medium | Misleading null-ai fallback for site 2 with invalid state |
| Tier 2 async coverage gap | Low | animateNumber / ring dashoffset not covered by current smoke suite |
| `_applyRiskCompact` text-sniff fragility | Low | String-based risk level detection; stable but not robust |
| IntersectionObserver stale closure | Low | `lazyRenderComparisonTable` captures state at observer registration time |
