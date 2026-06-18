# bug-172 — Remediation Architecture Review

> Principal Software Architect & Clinical Workflow Systems Reviewer
> Review date: 2026-06-18
> Status: DESIGN ONLY. No code modified. No commits created.

---

## Executive Summary

The bug-172 root cause is a **vocabulary collision**: the slot identifiers
`'implant'`, `'bridge'`, and `'crown'` were inherited from the single-tooth
treatment vocabulary and reused as restorative slot keys for backward
compatibility with `S.tx`. In the restorative rendering layer, two functions
treat these identifiers as treatment semantics rather than slot semantics,
producing inverted clinical displays.

The forensic audit identified the primary defect in two functions in
`index.html`. This architectural review independently audited every consumer
of `ai.rec` and the slot vocabulary across the full codebase and found:

- **A secondary defect** in `src/ai/explainLayer.js` — bone grafting and
  occlusal specialist referral signals fire incorrectly for conservative
  restorative cases, a consequence of the same vocabulary collision.
- **11 safe consumers** that already handle the restorative/single-tooth mode
  split correctly using `treatmentMode === 'restorative'` guards and
  `restorativeLabels` structured data.
- **Zero safe consumers** that use the raw slot key (`ai.rec === 'implant'`)
  as a treatment-type discriminator correctly in restorative mode.

**Recommended design: Option B — Add `recTreatmentId` to the engine output.**
One additive field in `buildRestorativeResult`, consumed by the three defective
sites. Zero backward-compatibility risk. Zero `S.tx` vocabulary change. Full
coverage of all known defect manifestations in 10–12 LOC.

**Final decision: A — Minimal Surgical Fix** implemented *as* Option B. The
structural fix IS the surgical fix; they are the same operation at this scope.

---

## 1. Dependency Audit

### 1.1 — Slot Vocabulary Writers

There is exactly one writer of `ai.rec` in the codebase:

**`src/ai/clinicalEngine.js` — `recommend()` (lines 258–282)**

```js
// rec = slot key: 'implant' | 'bridge' | 'crown' (restorative)
//                 'implant' | 'bridge' | 'crown' (single-tooth)
//                 'implant2'| 'bridge4'| 'cantilever' (multi)
const rec = biasFires ? bestPreserve.slot : ideal;
return { rec, ideal, conf, confLevel: ... };
```

`buildRestorativeResult()` (lines 327–382) consumes `recResult.rec` and
propagates it unchanged into the `ai` object as `ai.rec`.

The key design decision made at that layer: slot keys intentionally reuse
single-tooth vocabulary for `S.tx` backward compatibility. The comment at
`generateTreatments()` line 122 is explicit: `// SLOT 1 ('implant' S.tx key)`.

`_planEffectiveAi()` in `planFragments.js` (the bug-168 fix) clones `ai`
with `rec` overridden to `S.tx` — meaning the clinician selection is also
expressed in slot-key vocabulary. This is correct and necessary; it does not
create a new problem.

### 1.2 — Complete Consumer Map

| Consumer | File | Line(s) | Mode guard | Safe? | Notes |
|---|---|---|---|---|---|
| `_getPlanTimeline` | `index.html` | 3211 | None | **NO** | Primary defect — `isSurgical = ai.rec === 'implant'` |
| `_getPlanMaterialSummary` | `index.html` | 3286 | None | **NO** | Primary defect — same predicate |
| `_deriveLabMaterial` | `index.html` | 4379 | Partial | **NO** | extract_impl (slot3/'crown') routed to crown material |
| `_buildReferralSignals` | `explainLayer.js` | 155, 161 | None | **NO** | Secondary defect — bone graft / occlusal referral fires for slot1 conservative |
| `renderCost` (restorative) | `costGraphPanel.js` | 9–28 | `treatmentMode === 'restorative'` early-return | Yes | Uses `restorativeLabels.slot1/2/3` directly |
| `renderCost` (cost graph) | `costGraphPanel.js` | 325–370 | Restorative exits before these lines | Yes | `rec === 'implant'` never reached in restorative mode |
| `renderComparison` | `comparisonPanel.js` | 48–49, 210–221 | `treatmentMode === 'restorative'` | Yes | Uses `restorativeLabels`; slot key used only for CSS class (correct behavior) |
| `updateAICard` | `aiCardPanel.js` | 257–292 | `treatmentMode === 'restorative'` | Yes | Uses `recDisplay`; `ai.rec === 'implant'` only reached for non-restorative |
| `renderMaterial` | `materialPanel.js` | 29–35 | `treatmentMode === 'restorative'` | Yes | `_SLOT_ID_TO_MAT_CONTEXT` maps treatment ID — correct |
| `renderPlanView` (rec card) | `index.html` | 3324 | `treatmentMode === 'restorative'` | Yes | Uses `recDisplay` |
| `generateLabDocument` | `index.html` | 4409–4412 | `treatmentMode === 'restorative'` | Yes | Uses `recDisplay`; checks `slot1.id === 'onlay'` |
| Report opt cards | `index.html` | 4690–4696 | Inside restorative block | Yes | `isRec: ai.rec === 'implant'` marks slot1 winner highlight — semantically correct |
| Report slot mapping | `index.html` | 4763 | Inside restorative block | Yes | `ai.rec === 'bridge' ? 'slot2' : ...` — semantic slot mapper, correct |
| Workflow event | `index.html` | 2888 | None | Ambiguous | Records slot key as `rec` in analytics — ambiguous, not clinically harmful |
| Observation layer | `index.html` | 5023 | None | Ambiguous | `ai.rec` passed to `recTx` for workflow tracking — ambiguous |

**Summary:** 4 defective sites, 11 safe sites, 2 ambiguous (non-clinical).

### 1.3 — Secondary Defect Detail: `explainLayer.js`

**Lines 155–156:**
```js
if (p.poorBone && (ai.rec === 'implant' || ct === 'RESTORATIVE_HOPELESS')) {
  signals.push('Bone grafting consult recommended ...');
}
```

**Lines 161–163:**
```js
if (o.bruxism && (ai.rec === 'implant' || ct === 'RESTORATIVE_HOPELESS')) {
  signals.push('Occlusal assessment before final restoration ...');
}
```

In restorative mode when slot1 (conservative: onlay/endocrown/crown_core) is
recommended, `ai.rec === 'implant'` is true. If the patient also has poor bone
or bruxism, the following incorrect specialist signals are emitted:
- "Bone grafting consult recommended — D3/D4 bone requires augmentation
  assessment before implant placement." — **WRONG** for an onlay case.
- "Occlusal assessment before final restoration — active bruxism management
  is a prerequisite." — The bruxism signal itself is clinically defensible for
  any restoration, but the framing ("before final restoration") references an
  implant workflow.

The `ct === 'RESTORATIVE_HOPELESS'` branch of both OR conditions is correct:
hopeless cases progressing to extract+implant do warrant bone and occlusal
assessment. The defect is only in the `ai.rec === 'implant'` arm.

This defect manifests in the AI Insight panel's specialist referral section —
a different clinical surface than the Treatment Plan timeline.

---

## 2. Architectural Options

### Option A — Patch Rendering Logic Only (no new fields)

Replace `ai.rec === 'implant'` at each defective site with the correct
treatment ID lookup:

```js
// _getPlanTimeline (restorative branch only):
const recTx = ai.scored?.find(t => t.slot === ai.rec);
const isSurgical = recTx?.id === 'extract_impl';

// _getPlanMaterialSummary:
const recTxId = ai.scored?.find(t => t.slot === ai.rec)?.id;
if (ai.treatmentMode === 'restorative' && recTxId === 'extract_impl') ...

// explainLayer.js:
const recTxId = ai.scored?.find(t => t.slot === ai.rec)?.id;
if (p.poorBone && (recTxId === 'extract_impl' || ct === 'RESTORATIVE_HOPELESS')) ...
```

| Dimension | Assessment |
|---|---|
| Complexity | LOW — 3 sites, ~8 lines |
| Blast radius | 2 files, 4 functions |
| Maintainability | MEDIUM — inline `find()` is verbose; future authors must know the pattern |
| Backward compatibility | FULL — no interface change |
| Migration risk | VERY LOW — purely local substitutions |
| Clinical safety | Fixes all 4 defective sites |

**Weakness:** The vocabulary collision is patched but not documented in the
interface. A future author adding a new timeline variant will repeat the same
mistake. The `ai` object still has no explicit field stating "the winning
treatment's ID."

---

### Option B — Add `recTreatmentId` to Engine Output (recommended)

Add one computed field in `buildRestorativeResult`:

```js
return {
  ...existingFields,
  recTreatmentId: bySlot[recResult.rec]?.id || null,
  // 'onlay' | 'endocrown' | 'crown_core' | 'crown' | 'splinted'
  // | 'extract_impl' | 'crown_adv' — or null for non-restorative
};
```

Defective sites then read `ai.recTreatmentId`:

```js
// _getPlanTimeline:
const isSurgical = ai.recTreatmentId === 'extract_impl';

// _getPlanMaterialSummary:
if (ai.treatmentMode === 'restorative' && ai.recTreatmentId === 'extract_impl') ...

// explainLayer.js:
if (p.poorBone && (ai.recTreatmentId === 'extract_impl' || ct === 'RESTORATIVE_HOPELESS')) ...

// _deriveLabMaterial: use ai.recTreatmentId to detect extract_impl case
```

| Dimension | Assessment |
|---|---|
| Complexity | LOW — 1 engine line + 3 consumer sites |
| Blast radius | 3 files, 5 functions (~10–12 LOC total) |
| Maintainability | HIGH — explicit field, self-documenting |
| Backward compatibility | FULL — additive field; no existing consumer broken |
| Migration risk | VERY LOW — `recTreatmentId` is new, no existing code reads it |
| Clinical safety | Fixes all 4 defective sites; self-documenting for future authors |

**Advantage over A:** The `ai` object's interface makes the treatment ID
explicitly available. Any future consumer (new view, report, export, SaaS
surface) that needs to distinguish between treatment types in restorative mode
can read `ai.recTreatmentId` directly rather than re-deriving it via
`scored.find(...)`. The mistake cannot be repeated.

---

### Option C — Rename Slot Keys to `slot1`/`slot2`/`slot3`

Change `generateTreatments` to use `slot1`/`slot2`/`slot3` as slot keys.
Propagate `S.tx` vocabulary change throughout:

```js
// clinicalEngine.js: generateTreatments
{ slot: 'slot1', id: 'onlay', ... }
// recommendation engine:
rec = 'slot1' | 'slot2' | 'slot3'
// S.tx:
S.tx = 'slot1' | 'slot2' | 'slot3'  ← BREAKING CHANGE
```

| Dimension | Assessment |
|---|---|
| Complexity | HIGH — `S.tx` is read/written throughout `index.html`, `planFragments.js`, `comparisonPanel.js`, `materialPanel.js`, `aiCardPanel.js`, `_deriveLabMaterial`, `generateLabDocument`, and localStorage state |
| Blast radius | 7+ files, 30+ consumer sites, stored state schema |
| Maintainability | HIGH if complete |
| Backward compatibility | **NONE** — breaks all existing localStorage states with `S.tx = 'implant'`; requires migration logic |
| Migration risk | HIGH — any user with a saved patient case in localStorage would see state corruption on the next load unless a migration is written |
| Clinical safety | Fixes root cause, but migration risk introduces new failure modes |

**Why not this:** The `S.tx` field is persisted in localStorage. Every existing
patient case record stores `S.tx = 'implant'` or `'bridge'` or `'crown'` for
restorative selections. Renaming to `slot1/slot2/slot3` would silently corrupt
all existing records unless `init()` or `_loadLocal()` includes a migration
that translates old values. That migration is a new correctness surface with
its own test requirements. The blast radius is disproportionate to the defect.

---

### Option D — Introduce `ai.isSurgical` Boolean

Add a single computed boolean to `buildRestorativeResult`:

```js
isSurgical: bySlot[recResult.rec]?.id === 'extract_impl',
```

Used directly in the timeline and material functions. Similar to Option B but
expresses a single semantic concept rather than exposing the full treatment ID.

| Dimension | Assessment |
|---|---|
| Complexity | LOW |
| Blast radius | Same as B |
| Maintainability | MEDIUM — narrows the interface to one clinical question; but doesn't help future consumers who need the full treatment ID for other distinctions |
| Backward compatibility | FULL |
| Migration risk | VERY LOW |

**Why not preferred over B:** `recTreatmentId` is strictly more expressive.
`isSurgical` answers today's question but doesn't help a future consumer that
needs to distinguish onlay from endocrown from crown_core (which are all
non-surgical but have different lab requirements). The cost of adding a string
field vs. a boolean is identical; the benefit is broader.

---

## 3. Hidden Consumer Analysis

### Reports and PDF surfaces

`generateLabDocument()` in `index.html` (lines 4390–4423):
- For restorative mode: uses `ai.recDisplay` for label — correct
- Uses `slot1.id === 'onlay'` specifically — correct, reads treatment ID
- `_deriveLabMaterial` material for `extract_impl` in slot3 (slot key `'crown'`): **DEFECTIVE** — routes to crown material. Identified in forensic audit.

### AI Card — Specialist Referral section

`explainLayer.js` `_buildReferralSignals` — **DEFECTIVE**. Identified above.
This is a clinical-facing panel in AI Insight, not just the Treatment Plan view.

### Observation / Workflow Analytics

`_emitWfEvent('analysis_completed', { rec: _ai.rec })` at line 2888.
In restorative mode, this logs `rec: 'implant'` when slot1 wins. The
observation layer stores this in `S.wfHistory`. If this history is ever
consumed by an analytics surface or surfaced to the user, the slot-key
vocabulary is exposed without context. Currently the observation layer is
internal-only — not surfaced in any UI. Low risk but ambiguous long-term.

### Future SaaS surfaces

Any future consumer that reads the `ai` object from a JSON export, a backend
sync, or a React component would encounter `ai.rec = 'implant'` and likely
assume it means a titanium implant. The `recTreatmentId` field makes the
distinction explicit without requiring the consumer to also read `treatmentMode`
and `scored`.

### `src/react/RiskPanel.js`

```js
var isCrown = state.tx === 'crown' && ai.crownViable;
```

In restorative mode, `state.tx === 'crown'` means slot3 was selected. The
`RiskPanel` uses `isCrown` to conditionally render content. This is equivalent
to "slot3 content" — which is the escalation path (extract_impl or crown_adv).
The render path that follows would need to be reviewed; the variable name
(`isCrown`) is misleading in restorative context even if the behavior is
incidentally correct. Not a clinical defect currently — flagged as semantic debt.

---

## 4. Long-Term Architecture Review

### Is the `implant`/`bridge`/`crown` vocabulary sustainable?

**For `S.tx`:** Yes, with caution. The vocabulary is the user-selection
identifier stored in localStorage and used as the `S.tx` field. Every existing
patient case persists this value. Renaming it carries state migration risk.
The vocabulary is a selector key, not a semantic label — the display label is
always resolved through `restorativeLabels` or `_planTxLabel`. As long as all
consumers translate the slot key to its semantic content before rendering
(as the well-guarded panels do), the ambiguity is contained.

**For `ai.rec`:** Yes, with the explicit addition of `recTreatmentId`.
`ai.rec` serves two purposes simultaneously: (1) it is the slot selector that
maps to `restorativeLabels`, and (2) it mirrors `S.tx` for clinician-override
comparison in `_planEffectiveAi`. Both purposes are sound. The defect occurred
because two rendering functions treated it as having a third, incorrect purpose:
identifying the surgical nature of the treatment.

**Technical debt assessment:**

| Concern | Severity | Resolution |
|---|---|---|
| Slot key = vocabulary collision | MEDIUM | Mitigated by adding `recTreatmentId` and establishing the pattern that surgical-type decisions must use treatment IDs, not slot keys |
| `isSurgical = ai.rec === 'implant'` — implicit assumption | HIGH | Eliminated by fixing both sites |
| `explainLayer.js` referral signals | MEDIUM | Fixed by same `recTreatmentId` pattern |
| `S.tx` ambiguity in restorative mode | LOW | Acceptable — all correct consumers translate via `restorativeLabels` |
| Workflow event logs slot key | LOW | Acceptable — internal only, not clinical |
| `RiskPanel.js` `isCrown` name | COSMETIC | Rename in future refactor |

**Naming convention recommendation (non-binding):**
Future code additions that need to make clinical-type decisions in restorative
mode should use `ai.recTreatmentId` or `ai.scored.find(t => t.slot === rec)?.id`
— never `ai.rec === 'implant'` as a treatment discriminator. This rule should
be added to `cerebrum.md` after the fix is implemented.

---

## 5. Recommended Design

**Option B: Add `recTreatmentId` to `buildRestorativeResult`.**

### Rationale

**Why B over A:** Option A (inline `scored.find()`) patches the symptoms at
each site individually. Option B patches all sites with a shared explicit
field that documents its purpose and prevents future recurrence. The
implementation cost is identical. Option B is strictly superior.

**Why B over C:** Option C (rename slot keys) requires a localStorage migration
and has a blast radius 4× larger than B. The vocabulary collision is in the
rendering layer, not in `S.tx` storage — renaming storage keys would be a
disproportionate structural intervention for a rendering defect.

**Why B over D (`isSurgical` boolean):** `recTreatmentId` is more expressive
than a boolean. It enables future consumers to distinguish onlay/endocrown/
crown_core without requiring additional derive logic. Same cost, more utility.

---

## 6. Implementation Plan

### Files affected

| File | Function | Change | Est. LOC |
|---|---|---|---|
| `src/ai/clinicalEngine.js` | `buildRestorativeResult` | Add `recTreatmentId: bySlot[recResult.rec]?.id \|\| null` to returned object | +1 |
| `index.html` | `_getPlanTimeline` | Replace `ai.rec === 'implant'` with `ai.recTreatmentId === 'extract_impl'` in restorative branch | ±2 |
| `index.html` | `_getPlanMaterialSummary` | Replace `ai.rec === 'implant'` with `ai.recTreatmentId === 'extract_impl'` in restorative guard | ±1 |
| `index.html` | `_deriveLabMaterial` | Replace `state.tx === 'crown' \|\| isRestor` routing with treatment-ID aware logic for `extract_impl` | ±3 |
| `src/ai/explainLayer.js` | `_buildReferralSignals` | Replace `ai.rec === 'implant'` with `ai.recTreatmentId === 'extract_impl'` in both signals | ±2 |

**Total estimated change: 9–12 LOC across 3 files, 5 functions.**

### Estimated blast radius

- 0 files in `src/styles/`
- 0 files in `src/sync/`
- 0 files in `src/auth/`
- 0 files in `src/render/` (panels) — all are already correctly guarded
- 0 changes to `S.tx` vocabulary
- 0 changes to localStorage schema
- 0 changes to any external API or Supabase query

The change is entirely within the clinical computation output interface and
the rendering layer. No consumer outside the 5 functions above is affected.

### Validation requirements

**Must pass — existing:**
- `tests/engine/engine.spec.js` — all 9 ClinicalEngine scenarios
- `tests/ci/smoke.spec.js` — zero EB fires, zero page errors
- `tests/ci/_bug170_release_gate.spec.js` — 8/8 pass (regression check)

**Must be written — new:**

| Test | Scenario | Assertion |
|---|---|---|
| Restorative T1 | Slot1 wins (onlay case: good ferrule, vital, no bruxism) | Timeline shows `Tooth Preparation` NOT `Extraction & Implant` |
| Restorative T2 | Slot1 wins | Material shows ceramic/zirconia NOT `Titanium + Zirconia` |
| Restorative T3 | Slot3 wins, extract_impl (hopeless case) | Timeline shows `Extraction & Implant` AND `Osseointegration` |
| Restorative T4 | Slot3 wins, extract_impl | Material shows `Titanium + Zirconia` |
| Restorative T5 | Slot2 wins (standard crown) | Timeline shows `Tooth Preparation` (regression — slot2 was always correct) |
| Restorative T6 | Slot1 + poor bone | Referral signal does NOT include bone grafting |
| Restorative T7 | Slot3 extract_impl + poor bone | Referral signal INCLUDES bone grafting |
| Restorative T8 | Clinician selects slot3 (`S.tx = 'crown'`) when AI recommended slot1 | Timeline updates to surgical (override follows selection correctly) |
| Restorative T9 | `recTreatmentId` field present in ai object for restorative cases | Field exists, value is one of the valid treatment IDs |

These tests can be written in the same Playwright in-page mock pattern as
`_bug170_release_gate.spec.js` — the `_getAiForPlan(S)` function is callable
from the page context.

### Regression test requirements

The `_planEffectiveAi` interaction must be covered: tests T8 confirms that
when a clinician overrides to a different slot, `_planEffectiveAi` produces
a `planAi` with `rec` = the new slot key, and the timeline/material correctly
respond to `recTreatmentId` derived from that slot key. This requires
`_planEffectiveAi` to also propagate `recTreatmentId` when overriding `rec`.

**Additional engine change required:**

`_planEffectiveAi` in `planFragments.js` currently clones `ai` with only
`rec` and `recDisplay` overridden. When the clinician selects a different slot,
`recTreatmentId` in the cloned object must also be updated:

```js
function _planEffectiveAi(ai, sel) {
  if (!_planSelValid(ai, sel) || sel === ai.rec) return ai;
  if (ai.treatmentMode === 'restorative') {
    const SLOT = { implant: 'slot1', bridge: 'slot2', crown: 'slot3' };
    const selTreatmentId = ai.scored?.find(t => t.slot === sel)?.id || null;
    return {
      ...ai,
      rec: sel,
      recDisplay: ai.restorativeLabels?.[SLOT[sel]]?.label || ai.recDisplay,
      recTreatmentId: selTreatmentId,   // ← additional line
    };
  }
  return { ...ai, rec: sel };
}
```

This ensures the timeline and material functions see the correct `recTreatmentId`
regardless of whether the source is the AI recommendation or a clinician override.

**File count with this addition:** 4 files. **Total estimated LOC: ~14.**

---

## 7. Risk Analysis

### Regression risk: LOW

The change adds one field to the engine output object and substitutes one
identifier in each of 4 rendering functions. No existing consumer reads
`recTreatmentId` (confirmed by grep — field does not exist anywhere). No
consumer that reads `ai.rec` is modified; they continue to receive the same
value they always have.

### Forward-compatibility risk: LOW

Adding `recTreatmentId` to the engine output object is additive. Any future
consumer that does not need it ignores it. Any future consumer that correctly
needs the treatment ID (rather than the slot key) now has a clean interface
to read.

### Clinical safety risk of NOT fixing: MEDIUM

Restorative cases (present tooth with caries/damage) shown with the wrong
timeline or wrong material mislead the clinical decision review process.
Specialist referral signals for bone grafting or occlusal assessment appear
incorrectly for conservative cases. For a supervised Clinical Validation Phase,
this is manageable under restriction. For general deployment it is not
acceptable.

---

## 8. Certification Impact

The Stable Baseline V1 certification (Condition 1) requires bug-172 to be
fixed before unrestricted clinical use.

**This remediation design, if implemented:**

- Resolves Condition 1 completely
- Adds `recTreatmentId` as a stable, tested interface field — reducing the
  risk of recurrence in future development
- Introduces a clear code pattern (treatment-ID-based discrimination) that
  can be recorded in `cerebrum.md` as a project convention
- Expands the test suite from 8 tests (bug-170 gate) to approximately
  17 tests covering the full restorative decision surface
- Does not require a schema migration, a cache invalidation, or a Supabase
  change

Upon successful implementation and test validation, the certification board
would be presented with:

| Condition | Status |
|---|---|
| Condition 1 (bug-172 restorative rendering) | CLOSED |
| Condition 2 (deployment doc stale) | Requires separate 1-line update |
| Condition 3 (buglog integrity) | Requires separate buglog correction |
| Condition 4 (no release tag) | Requires tag application |

All four conditions would be closeable in a single release cycle following
this fix.

---

## Final Decision

**A — Minimal Surgical Fix, implemented as Option B.**

The structural improvement (adding `recTreatmentId`) IS the minimal surgical
fix. The difference between Option A (inline find) and Option B (named field)
is one line in the engine and a named interface vs. an anonymous inline
derivation. Option B costs nothing extra and eliminates future recurrence.

The recommended approach is not "do the minimal thing" or "do the architectural
thing" — it is to do the single correct thing that fixes all 4 defective sites
(including the secondary `explainLayer.js` defect not identified in the prior
forensic audit), costs 14 LOC across 4 files, carries zero backward-
compatibility risk, and makes the intent explicit for future maintainers.

**Do not implement until approved.**
