# bug-172 — Forensic Audit

> Senior Software Forensics Engineer & Clinical Workflow Auditor
> Audit date: 2026-06-18
> Status: READ-ONLY. No code modified. No commits created.

---

## Executive Summary

**Bug-172 is real, always reproducible for the affected case classes, and is a pure
rendering defect. It does not touch clinical computation, scoring, or data persistence.**

The defect is a **slot-key vocabulary collision** in two rendering functions:
`_getPlanTimeline()` and `_getPlanMaterialSummary()` in `index.html`. Both
functions test `ai.rec === 'implant'` to detect the surgical pathway. In
restorative mode, `'implant'` is a slot identifier for the **conservative** option
(onlay / endocrown / crown_core), not a surgical implant. The surgical pathway
(`extract_impl`) occupies slot `'crown'`. This inversion causes any restorative
case where slot 1 or slot 3 is recommended or selected to display the wrong
procedural timeline and wrong material specification in the Treatment Plan panel
and Lab View card.

**The defect is entirely in the presentation layer.** The clinical engine's outputs
— scores, recommendation, confidence, case classification, rationale — are
unaffected. Patient data is unaffected. Lab documents are substantially correct.
The AI Recommendation card displays correctly via a separate `recDisplay` field.

**Clinical validation can continue safely with restrictions** (verdict B). The
defect affects only the Treatment Plan timeline and material display. All
implant and bridge single-tooth cases are outside the affected path. Restorative
cases can proceed under Clinical Validation Phase only if clinicians are instructed
to rely on the AI Insight panel (which is correct) for procedure explanation, not
the Treatment Plan timeline.

---

## 1. Investigation Scope

Files examined:
- `src/ai/clinicalEngine.js` — clinical computation, slot assignment, recommendation
- `src/render/planFragments.js` — `_planEffectiveAi`, `_planTxLabel`, `_buildTreatmentPathRows`
- `index.html` — `_getPlanTimeline` (~3203), `_getPlanMaterialSummary` (~3284),
  `renderPlanView` (~3299), `renderLabView` (~3465), `_deriveLabMaterial` (~4361),
  `generateLabDocument` (~4390)
- `.wolf/buglog.json` — bug-172 entry (pre-existing record, high-quality root cause)

---

## 2. Evidence

### 2.1 — The Slot Vocabulary in clinicalEngine.js

`generateTreatments()` (lines 97–143) assigns slot keys that reuse the single-tooth
vocabulary (`implant`, `bridge`, `crown`) as identifiers:

```js
// SLOT 1 key = 'implant' → but treatment id = 'onlay' | 'endocrown' | 'crown_core'
{ slot: 'implant', id: 'onlay',      label: 'Onlay / Overlay',   sub: 'Minimal Prep · Conservative' }
{ slot: 'implant', id: 'endocrown',  label: 'Endocrown',         sub: 'Monolithic · No Post' }
{ slot: 'implant', id: 'crown_core', label: 'Crown + Core',      sub: 'Post & Core Build-up' }

// SLOT 2 key = 'bridge' → treatment id = 'crown' | 'splinted'
{ slot: 'bridge',  id: 'splinted',   label: 'Splinted Crowns',   sub: 'Load Distribution' }
{ slot: 'bridge',  id: 'crown',      label: 'Crown',             sub: 'Standard Coverage' }

// SLOT 3 key = 'crown' → treatment id = 'extract_impl' | 'crown_adv'
{ slot: 'crown',   id: 'extract_impl', label: 'Extract + Implant', sub: 'Escalation Path' }
{ slot: 'crown',   id: 'crown_adv',    label: 'Crown + Core',      sub: 'Full Coverage' }
```

The comment on line 122 is explicit: `// SLOT 1 ('implant' S.tx key) — minimal / conservative option`.
The slot key `'implant'` was deliberately chosen for its role as `S.tx` compatibility
(backward compatibility with the single-tooth selection vocabulary) — not because
anything in slot 1 is a titanium implant.

`recommend()` (lines 258–282) returns `rec = slot key` — the winning slot's key,
not the treatment's `id`. So `ai.rec` in restorative mode is always one of
`'implant'`, `'bridge'`, or `'crown'`.

`buildRestorativeResult()` (lines 327–376) preserves two parallel fields:
- `ai.rec` — the slot key (e.g., `'implant'` for onlay winner)
- `ai.recDisplay` — the human-readable treatment name (e.g., `'Onlay / Overlay'`)

### 2.2 — The Defective Functions

**`_getPlanTimeline()` (index.html lines 3203–3282):**

```js
if (ai.treatmentMode === 'restorative') {
  const isSurgical = ai.rec === 'implant';   // LINE 3211 — THE DEFECT
  if (isSurgical) {
    return [
      { label: 'Extraction & Implant',  dur: '1 session', ... },
      { label: 'Osseointegration',      dur: boneRisk, ... },
      { label: 'Crown Fabrication',     dur: '2–3 weeks', ... },
      { label: 'Crown Delivery',        dur: '1 visit', ... },
    ];  // ← SURGICAL TIMELINE shown when slot1 recommended
  }
  // else: conservative (Tooth Preparation, Lab Fabrication, Delivery)
}
```

`isSurgical = ai.rec === 'implant'` is the defective predicate. In restorative
mode, `ai.rec === 'implant'` means slot 1 won — which holds onlay, endocrown,
or crown_core. All three are conservative, non-surgical procedures. None involves
extraction or osseointegration.

Conversely, the only surgical path (`extract_impl`) lives in slot 3 with
`ai.rec === 'crown'`, which evaluates `isSurgical` as `false`. That case falls
through to the conservative branch showing "Tooth Preparation, Lab Fabrication,
Delivery" — a tooth-preservation timeline displayed for an extraction procedure.

**`_getPlanMaterialSummary()` (index.html lines 3284–3297):**

```js
if (ai.treatmentMode === 'restorative' && ai.rec === 'implant')
  return { primary: 'Titanium + Zirconia', reason: 'Best biocompatibility & load bearing', rate: '95%+' };
```

Same defective predicate. An onlay case (slot1/'implant') receives `Titanium + Zirconia`
as its material. An extract+implant case (slot3/'crown') falls through to the generic
`e.max (Lithium Disilicate)` or `Zirconia` branch — which is the material for a crown,
not an osseointegrated implant fixture.

### 2.3 — Bug-168 Fix Interaction

`_planEffectiveAi()` in `planFragments.js` (the bug-168 fix) propagates the
clinician's selection `S.tx` by creating a shallow clone of `ai` with `rec = S.tx`.
The planAi object passed to `_getPlanTimeline(planAi)` and `_getPlanMaterialSummary(planAi)`
then carries the clinician's slot selection as `planAi.rec`.

This means the slot-key vocabulary inversion applies identically whether the source
is the AI recommendation (`ai.rec`) or the clinician's override (`S.tx`). Bug-168
widened the defect's observable surface: previously only the AI recommendation could
trigger the wrong timeline; now any clinician selection of slot 1 or slot 3 does too.

### 2.4 — Lab Document: Substantially Correct

`generateLabDocument()` (lines 4390–4423) uses a different code path for restorative
cases:

```js
txLabel   = ai.recDisplay || 'Crown';           // reads the correct human label
const isOv = ai?.restorativeLabels?.slot1?.id === 'onlay' && S.tx === 'implant';
txSummary = isOv ? 'Partial-coverage overlay restoration' : 'Full-coverage crown restoration';
```

This branch reads `ai.restorativeLabels.slot1.id` — the actual treatment ID — not
the slot key. For an onlay case it correctly identifies the procedure as a
"Partial-coverage overlay restoration." For endocrown/crown_core it shows
"Full-coverage crown restoration" — correct. The printed lab document label
and summary are not affected by bug-172.

**One exception:** `_deriveLabMaterial()` (lines 4361–4388) for restorative mode
routes through `state.tx === 'crown' || isRestor` for all non-onlay restorative
cases. An `extract_impl` case (where `state.tx === 'crown'`) enters the
`getCrownMaterial(state)` branch and returns a ceramic crown material instead of
`Titanium + Zirconia Implant`. The lab document material for an extract+implant
restorative case is therefore wrong — but only the material, not the label or
procedure summary.

---

## 3. Data Flow Trace

```
S.* (patient clinical inputs)
    │
    ▼
clinicalEngine.js: ClinicalEngine.process(S)
    │
    ├─ classifyCase()  → CT.RESTORATIVE_VIABLE | COMPROMISED | HOPELESS
    ├─ buildCosts()    → c.costs.*
    ├─ generateTreatments(caseClass, c)
    │     returns slots: [{slot:'implant', id:'onlay'|'endocrown'|'crown_core'},
    │                     {slot:'bridge',  id:'crown'|'splinted'},
    │                     {slot:'crown',   id:'extract_impl'|'crown_adv'}]
    ├─ scoreRestorative()  → [{...tx, score, rationale}]  ← CORRECT
    ├─ recommend()         → {rec: SLOT_KEY, conf, confLevel}  ← rec = slot key
    ├─ explain()           → {summary, reasons, factors}
    └─ buildRestorativeResult()
          → ai.rec         = slot key ('implant'|'bridge'|'crown')  ← ambiguous vocabulary
          → ai.recDisplay  = 'Onlay / Overlay' | 'Endocrown' | ...  ← CORRECT
          → ai.restorativeLabels = {slot1:{id,label}, slot2:{...}, slot3:{...}}  ← CORRECT
          → ai.scored, ai.treatments, ai.caseClass  ← all CORRECT
    │
    ▼
planFragments.js: _planEffectiveAi(ai, S.tx)
    │     if S.tx !== ai.rec → clone ai with rec = S.tx (bug-168 clinician override)
    │     passes rec = slot key through unchanged
    ▼
    planAi.rec ∈ {'implant', 'bridge', 'crown'}  ← slot key, not treatment ID
    │
    ├─ _getPlanTimeline(planAi)
    │     ❌ isSurgical = planAi.rec === 'implant'   ← DEFECT: slot1 ≠ surgical
    │     WRONG OUTPUT for slot1 (conservative) and slot3/extract_impl (surgical)
    │
    ├─ _getPlanMaterialSummary(planAi)
    │     ❌ planAi.rec === 'implant' → Titanium + Zirconia  ← DEFECT: slot1 ≠ implant
    │     WRONG OUTPUT for slot1 (conservative) and slot3/extract_impl (surgical)
    │
    ├─ _buildTreatmentPathRows(planAi)
    │     ✅ reads ai.recDisplay (correct label) → CORRECT
    │
    ├─ renderLabView: _getPlanMaterialSummary(...)
    │     ❌ same defect as above → Lab View material card WRONG
    │
    └─ generateLabDocument: txLabel = ai.recDisplay
          ✅ CORRECT label and summary (reads treatment ID via restorativeLabels)
          ❌ _deriveLabMaterial: extract_impl routed to crown material → WRONG material
```

---

## 4. Root Cause Analysis

### Primary cause

**Vocabulary collision between slot identifiers and treatment type identifiers.**

The slot key `'implant'` was assigned to slot 1 for backward compatibility with the
`S.tx` selection vocabulary from single-tooth mode, where `S.tx === 'implant'` means
a titanium osseointegrated implant. In restorative mode, `S.tx === 'implant'` means
"slot 1 / conservative option." The rendering functions `_getPlanTimeline` and
`_getPlanMaterialSummary` were written against the single-tooth semantic, not the
restorative semantic.

**Responsible file:** `index.html`
**Responsible functions:** `_getPlanTimeline` (line 3211), `_getPlanMaterialSummary` (line 3286)
**Responsible predicate:** `ai.rec === 'implant'` used as a surgical/procedural
discriminator when it should be a slot discriminator.

### Secondary cause (contributing)

The `ai` object returned by `buildRestorativeResult` carries both `ai.rec` (slot key,
semantically overloaded) and `ai.restorativeLabels` (slot → treatment ID, semantically
correct) but `_getPlanTimeline` and `_getPlanMaterialSummary` use only `ai.rec` and
ignore `ai.restorativeLabels` and `ai.scored`. The correct discriminator for "is this
a surgical path?" is not `ai.rec === 'implant'` but rather the treatment ID:
`ai.scored.find(t => t.slot === ai.rec)?.id === 'extract_impl'`.

### Tertiary cause (scope widener)

Bug-168's `_planEffectiveAi` propagates `rec = S.tx` (the clinician's slot selection)
into `planAi`. This is correct for bug-168's purpose but it widens bug-172's surface
from "only the AI recommendation triggers the wrong display" to "any clinician
selection of slot 1 or slot 3 triggers the wrong display."

---

## 5. Reproduction Conditions

### Always triggers — wrong surgical timeline displayed

**Condition:** Restorative treatment mode AND `ai.rec === 'implant'` (slot 1 wins)

Patient profile that reliably triggers slot1 win:
- Tooth with caries (existing tooth present)
- Good remaining structure (ferrule ≥2mm)
- No RCT needed (vital pulp)
- No bruxism
- Any posterior tooth

Engine assigns `onlay` to slot1, scores it highest (91+ base), `rec = 'implant'`.
`_getPlanTimeline` shows: Extraction & Implant, Osseointegration (3–4 months),
Crown Fabrication, Crown Delivery — **wrong: 6 surgical steps for a conservative onlay**.
`_getPlanMaterialSummary` shows: `Titanium + Zirconia` — **wrong: ceramic/resin for onlay**.

### Always triggers — wrong conservative timeline displayed

**Condition:** Restorative treatment mode AND `ai.rec === 'crown'` (slot 3 wins)
AND slot 3 treatment id = `extract_impl`

Patient profile:
- Tooth with advanced caries or hopeless prognosis
- Case classification: `RESTORATIVE_HOPELESS` or `RESTORATIVE_COMPROMISED`
- Extraction viable

Engine assigns `extract_impl` to slot3, `rec = 'crown'`.
`_getPlanTimeline` shows: Tooth Preparation, Lab Fabrication, Delivery & Cementation —
**wrong: conservative crown steps for an extraction + implant procedure**.
`_getPlanMaterialSummary` shows: `e.max (Lithium Disilicate)` or `Zirconia` —
**wrong: ceramic crown material for a titanium implant system**.

### Never triggers — slot 2 is always correct

**Condition:** `ai.rec === 'bridge'` (slot 2 wins)

For any restorative case where the standard crown or splinted crown option wins:
- `isSurgical = 'bridge' === 'implant'` = `false`
- Falls through to the conservative branch
- Timeline: Tooth Preparation, Lab Fabrication, Delivery — correct for a crown
- Material: falls through to `highOcc`/`weakTooth` branches — clinically reasonable for a crown

Slot 2 recommendation is safe.

### Conditionally triggered — `crown_adv` in slot 3

When slot3 holds `crown_adv` (not `extract_impl`) and wins:
- `ai.rec === 'crown'` → conservative timeline displayed
- `crown_adv` is a full-coverage crown — conservative timeline is approximately correct
- This is a false negative: the bug fires but the output happens to be acceptable

---

## 6. Affected Surfaces

| Surface | Affected | Finding |
|---|---|---|
| Treatment Plan — timeline | **YES** | Surgical/conservative inversion for slot1 and slot3 |
| Treatment Plan — material card | **YES** | Titanium+Zirconia for conservative; ceramic for extract_impl |
| Treatment Plan — AI Recommendation card | No | Uses `ai.recDisplay` — correct |
| Treatment Plan — treatment pathway rows | No | Uses `_buildTreatmentPathRows` → `recDisplay` — correct |
| Treatment Plan — confidence score | No | Unaffected |
| Lab View — material card | **YES** | Same `_getPlanMaterialSummary` call — same inversion |
| Lab View — restoration label | No | Uses `_planTxLabel` → `recDisplay` — correct |
| Lab document — procedure label | No | Uses `ai.recDisplay` — correct |
| Lab document — procedure summary | No | Correctly branches on `slot1.id === 'onlay'` |
| Lab document — material | **Partially** | `_deriveLabMaterial` returns ceramic for extract_impl |
| AI Insight panel | No | Unaffected — different renderer |
| Clinical engine | No | Unaffected — scoring and recommendation correct |
| Data persistence | No | Unaffected |
| Reports | No | `_deriveLabMaterial` uses treatment ID — mostly correct |

---

## 7. Impact Assessment

### Defect classification: A — RENDERING DEFECT (PRESENTATION LAYER ONLY)

The defect does not alter:
- What treatment the clinical engine recommends
- What the confidence score or rationale is
- What treatment is stored in `S.tx` (the clinician's selection)
- What is printed on the lab sheet
- Patient data in localStorage or Supabase

The defect alters only:
- The procedural timeline displayed in the Treatment Plan panel
- The material specification displayed in the Treatment Plan panel
- The material displayed in the Lab View status card

### Severity: MEDIUM

**Rationale for MEDIUM (not HIGH or CRITICAL):**

1. The AI Recommendation card on the same Treatment Plan page displays the correct
   treatment name (e.g., "Onlay / Overlay") via `recDisplay`. A clinician reading the
   page holistically will see the correct recommendation at the top and the wrong timeline
   below — the contradiction is detectable by a trained reviewer.

2. The defect does not cause the wrong treatment to be ordered, approved, or communicated
   to the lab. Lab documents and reports use correct code paths.

3. The affected scenario (restorative mode with slot1 or slot3 winning) requires a tooth
   to be present (not missing) — this excludes the single-tooth missing/implant and
   multi-tooth cases entirely. Bridge and standalone crown single-tooth cases also fall
   outside the restorative path.

**Rationale against LOW:**

1. The wrong timeline is highly visible — 6 surgical steps including "Extraction & Implant"
   and "3–4 months Osseointegration" for a conservative onlay case is not a subtle
   deviation. A clinician using this view to walk a patient through their plan would
   present clinically incorrect information.

2. The wrong material specification ("Titanium + Zirconia" for an onlay) contradicts
   the actual dental material used. If the material card is referenced in pre-authorization
   or cost estimation, it would produce an incorrect figure.

3. Bug-168's fix propagated the defect to the clinician override path, not just the
   AI recommendation path. Both the AI recommendation and any clinician selection of
   slot 1 or slot 3 now produce wrong output.

---

## 8. Clinical Validation Risk

**Verdict: B — YES, Clinical Validation can continue with restrictions.**

**Evidence supporting B over C:**

1. The Treatment Plan panel is a display artifact — it does not drive treatment execution.
   The actual treatment path is set by `S.tx`, persisted to localStorage/Supabase, and
   used in lab orders via `generateLabDocument`, which is substantially correct.

2. The AI Insight panel — the primary clinical decision support surface — is entirely
   unaffected. Recommendation, confidence, rationale, and factor analysis are correct.

3. All implant cases (single missing tooth → implant), all bridge cases, and all
   multi-tooth cases are outside the restorative computation path and unaffected.

4. The defect is detectable in normal clinical use: a trained clinician who sees "Extraction
   & Implant" timeline for a "Crown + Core" or "Onlay" recommendation on the same page
   will recognize the inconsistency.

**Required restrictions for Clinical Validation Phase:**

- Clinicians must be informed that the Treatment Plan timeline and material display
  are unreliable for restorative cases (present tooth with caries/damage, not missing).
- For restorative cases, procedure explanation to patients must use the AI Insight panel,
  not the Treatment Plan timeline.
- Lab orders must use the printed lab sheet (generated via `generateLabDocument`) as the
  authoritative material specification, not the on-screen material card.
- Validation case logging should flag any case where the Treatment Plan timeline is used
  as the sole basis for patient communication.

**These restrictions are operationally feasible** for a supervised Clinical Validation
Phase where clinicians work with a protocol document. They are not feasible for an
unmonitored general deployment.

---

## 9. Certification Impact

The Stable Baseline V1 certification (Condition 1) correctly identified bug-172 as
a prerequisite for unrestricted clinical use. This forensic audit confirms and
refines that finding:

| Prior certification statement | Forensic verdict |
|---|---|
| "May display incorrect procedural steps for restorative cases" | Confirmed — always for slot1/slot3 |
| "Affects Treatment Plan view" | Confirmed — timeline + material |
| "Does not affect AI recommendation or data persistence" | Confirmed |
| "Should be fixed before unrestricted clinical use" | Confirmed |

**Refinement from this investigation:**
- The defect also affects the **Lab View material card** (not mentioned in the prior report)
- The defect also affects the **lab document material** for `extract_impl` cases (partial)
- Slot 2 recommendations (crown/splinted) are safe — this narrows the restriction scope
- The defect is in exactly two functions, both in `index.html` — fix scope is small

---

## Appendix — Responsible Code Locations

| Location | Line | Issue |
|---|---|---|
| `index.html` — `_getPlanTimeline` | 3211 | `isSurgical = ai.rec === 'implant'` — incorrect predicate |
| `index.html` — `_getPlanMaterialSummary` | 3286 | `ai.rec === 'implant'` → Titanium — incorrect predicate |
| `index.html` — `_deriveLabMaterial` | 4365–4383 | extract_impl (slot3/'crown') routed to crown material |
| `src/ai/clinicalEngine.js` — `generateTreatments` | 122–143 | Slot key reuse is the root vocabulary decision |
| `src/render/planFragments.js` — `_planEffectiveAi` | 37–44 | Propagates slot key — correct for bug-168 purpose, widens bug-172 |

No fix is proposed. This document is investigation only.
