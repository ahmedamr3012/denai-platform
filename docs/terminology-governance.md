# denai — Terminology Governance

> Phase 3C-i internal architecture document.
> Canonical source of truth for all product language across UI, reports, exports, trust pages, and legal documents.
> Update this document whenever a new terminology decision is made. Do not let it drift.

---

## 1. Purpose

Language consistency is part of denai's trust architecture.

Every surface where language appears — UI labels, AI output, exported reports, legal pages, help text — makes an implicit claim about what denai is and what it does. Inconsistent or imprecise language:

- Creates regulatory ambiguity (terms like "diagnosis" or "clinical decision" carry legal meaning in healthcare software regulation)
- Undermines clinician trust (overpromising AI capability sets expectations the product cannot meet)
- Blurs the AI-boundary (clinicians must always understand where AI assistance ends and clinical judgment begins)
- Creates liability exposure (language used in marketing or UI can be treated as a product warranty)

This document is the single source of truth. All future features, legal documents, and copy should be checked against it. Conflicts between new copy and this document should be resolved by updating this document first — not by diverging silently.

---

## 2. Product Identity Rules

### Canonical product identity

denai is an **AI-assisted clinical workflow tool** for dental clinicians.

It organizes clinical workflow. It generates treatment pathway suggestions from structured clinical inputs. The treating clinician reviews those suggestions and makes all clinical determinations.

### Preferred wording hierarchy

| Context | Preferred phrase |
|---------|-----------------|
| Full product description | AI-assisted clinical workflow platform |
| Short/inline reference | clinical workflow tool |
| Feature-level reference | workflow assistance |
| Product name only | denai (lowercase, no trademark symbol required) |

### What denai is NOT

Never describe denai as any of the following:

| Prohibited framing | Why |
|-------------------|-----|
| Diagnostic AI | Implies the product makes diagnoses — a regulated clinical act |
| Clinical authority | Denai has no clinical authority; clinicians do |
| AI Co-Pilot | Anthropomorphic; implies shared decision-making agency |
| Autonomous assistant | Implies the product operates independently of clinician oversight |
| Medical device | Denai is not registered or cleared as a medical device |
| Clinical Decision Support Platform | Carries SaMD (Software as a Medical Device) regulatory connotations |

### Version strings and metadata

Use `denai` (lowercase) in all version strings, log entries, and file headers. `Dandy` is the legacy name — do not use it in any user-facing or external surface.

---

## 3. AI Terminology Rules

### Canonical AI language

| Concept | Preferred term | Notes |
|---------|---------------|-------|
| What the AI produces | AI-generated recommendation | Always "generated", never "provided" or "determined" |
| The AI system | Recommendation engine | Lowercase; not "AI engine", not "model" in UI |
| Quality metric | Recommendation strength | See prohibition on "confidence" below |
| Clinical inputs used | Structured clinical inputs | Or list them specifically: tooth position, bone level, hygiene status |
| What the AI does | Analyzes clinical inputs · generates pathway suggestions | Verb precision matters |
| Relationship to clinician | Supports clinical workflow | Never "assists the clinician" (implies collaboration agency) |

### Required AI boundary language

The following sentence (or close equivalent) must appear adjacent to any AI output surface:

> "This recommendation is generated from the clinical inputs provided and supports — not replaces — clinical judgment."

This is the `.ai-boundary` sentence. Do not remove it. Do not shorten it to a disclaimer icon. Do not move it into collapsed/toggleable UI.

### Input transparency

Where space allows, AI output should include the specific inputs used:

> "Based on: tooth #N (jaw, position), bone: level, hygiene: level"

This is the `#aiInputLine` pattern. It reduces overtrust by making the recommendation's basis visible.

### Prohibited AI language

| Prohibited phrase | Why | Use instead |
|------------------|-----|-------------|
| AI diagnosis | "Diagnosis" is a regulated clinical act | AI-generated recommendation |
| Confident / confidence | Implies probabilistic precision the model does not provide | Recommendation strength |
| Confidence score | Same; also sounds like a percentage certainty | Recommendation strength |
| % confidence / 87% confident | Creates false quantitative precision | Omit percentage; use strength descriptor |
| Certainty / certain | Same family; implies more than the model warrants | — |
| Accurate AI | Cannot be substantiated; creates warranty expectation | — |
| Intelligent platform | Marketing hype; not an operational claim | — |
| AI thinks / AI believes | Anthropomorphic; models do not think or believe | The recommendation engine suggests… |
| Smart recommendations | Vague marketing; "smart" is unquantifiable | — |
| AI-powered (as primary descriptor) | Positions AI before clinical purpose | AI-assisted (secondary); workflow first |

---

## 4. Workflow Terminology Rules

### The action/state/history distinction

This is a foundational distinction established in Phase 3B. **Never conflate these three registers.**

| Register | What it describes | Example |
|----------|------------------|---------|
| **Action label** | What the user is about to do (button text, CTA) | "Mark Ready for Lab" |
| **State label** | What has happened (badge, status pill, timeline step) | "Plan Approved" |
| **History/audit label** | What was recorded in the event log | "Plan marked ready for lab" |

Action labels change if the UX framing changes. State labels describe a past event accurately and should not change to avoid confusion in audit/history views.

### Canonical workflow terms

| Workflow moment | Canonical term | Do not use |
|----------------|---------------|-----------|
| Clinician advances plan to lab | Mark Ready for Lab | Approve Plan · Authorize Plan · Sign Off |
| State after plan is advanced | Plan Approved | Plan Authorized · Plan Signed |
| Plan sent to lab system | Lab Sent / Sent to Lab | Dispatched · Forwarded |
| Lab work returned | Lab Received | Lab Complete · Delivery Ready |
| Clinical pathway stage | Workflow stage | Case phase · Treatment phase |
| Output document | Delivery report / workflow report | Clinical report (implies clinical authority) |
| Restoring a completed plan | Reopen Planning | Undo approval · Revoke plan |

### Workflow stage names

| Stage | Canonical label | Notes |
|-------|----------------|-------|
| Pre-analysis | New Case | No condition entered yet |
| Analysis active | In Analysis | Condition/inputs entered; no plan approved |
| Plan advanced | Plan Approved | `S.planApproved = true` |
| Lab workflow | Lab Sent · Lab Received | Based on `S.labStatus` |
| Complete | Delivered | Post-reception, report generated |

### Workflow authority boundary

Workflow actions are **logistical state transitions**, not clinical authorizations.

Any UI disclosure near workflow action buttons must include language equivalent to:

> "This is a workflow marker — clinical decisions remain with the treating clinician."

---

## 5. Trust & Privacy Terminology

### Data location

| Concept | Preferred term | Prohibited |
|---------|---------------|-----------|
| Primary data store | Local-first · device-local · browser storage | On-premise · local server |
| Cloud sync | Cloud sync · optional cloud sync | Cloud backup (implies guaranteed redundancy) |
| Cloud sync active | Cloud sync active | Synced · Connected · Backed up |
| Cloud sync inactive | Local-only mode | Offline mode (implies a problem) |
| Supabase | Supabase (named directly) | "our cloud" · "secure servers" · unnamed third party |

### Encryption language

| Concept | Preferred term | Prohibited |
|---------|---------------|-----------|
| Notes encryption | Client-side encrypted · AES-GCM 256-bit | Bank-grade · military-grade · unbreakable |
| Encryption state (active) | Auto-saved · encrypted | Securely stored · HIPAA-encrypted |
| Encryption state (inactive) | Auto-saved · local only | Unencrypted (alarming) · plaintext (technical, not user-facing) |
| Key management | Passphrase-derived key · key held in memory only | Password-protected (conflates password with derived key) |

### Privacy claims

| Statement | Status | Replacement |
|-----------|--------|------------|
| "HIPAA-compliant" | **Prohibited** — not certified | "Privacy-protective design" · "local-first architecture" |
| "Your data is safe" | **Prohibited** — too broad | Describe specifically what is protected and how |
| "We never share your data" | **Prohibited** — Supabase is a third party | "We do not sell your data. Cloud sync data is processed by Supabase." |
| "Secure cloud storage" | **Prohibited** — unqualified | "Optional client-side encrypted cloud sync" |
| "Bank-grade encryption" | **Prohibited** — meaningless | "AES-GCM 256-bit client-side encryption" |

### localStorage disclosure requirement

Any Privacy Policy, help text, or onboarding that addresses data storage **must** include:

> "Clearing your browser's storage will permanently remove local-only records."

And for encrypted notes:

> "If you lose your passphrase, notes stored in the cloud cannot be recovered — there is no recovery mechanism."

Both are operationally critical disclosures. Neither is optional.

---

## 6. Prohibited Terminology

Quick-reference table for copy review. Use as a checklist before any release.

| Prohibited phrase | Reason | Preferred replacement |
|------------------|--------|----------------------|
| Clinical Decision Support Platform | SaMD regulatory connotation | AI-assisted clinical workflow platform |
| AI Co-Pilot | Anthropomorphic agency | Recommendation engine |
| AI Confidence Score | Implies probabilistic precision | Recommendation strength |
| Diagnosis / diagnose | Regulated clinical act | Recommendation · clinical input |
| Medical advice | Legal category denai does not provide | Workflow assistance · treatment pathway suggestion |
| HIPAA-compliant | Uncertified claim | Privacy-protective design · local-first |
| Accurate AI / accurate recommendations | Warranty-creating language | Informational recommendations |
| Intelligent platform / smart platform | Unquantifiable marketing | — (remove entirely) |
| Confident / certainty / % confidence | Misleading precision | Recommendation strength |
| Approve Plan (action label) | Implies clinical/legal authorization | Mark Ready for Lab |
| Secure cloud storage | Overstated; unqualified | Optional client-side encrypted cloud sync |
| Military-grade / bank-grade encryption | Meaningless marketing | AES-GCM 256-bit client-side encryption |
| Your data is safe | Overstated blanket claim | Describe specific protection specifically |
| We never share your data | False — Supabase receives data | "We do not sell your data…" (with Supabase named) |
| No data loss / prevents data loss | Cannot be guaranteed | — (omit the claim entirely) |
| AI thinks / AI believes | Anthropomorphic | The recommendation engine suggests… |
| Dandy | Legacy product name | denai |

---

## 7. Tone & Voice Rules

### Core register

denai communicates in a **clinician-to-clinician voice**: precise, calm, operational, and direct. Assume the reader is a licensed dental clinician with professional training.

### Preferred qualities

| Quality | What it means in practice |
|---------|--------------------------|
| Calm | No exclamation points. No urgency theater. No warnings where information suffices. |
| Clinical | Terminology is precise. Descriptions are operational, not emotional. |
| Restrained | Say what is true. Do not amplify. Do not hedge excessively. |
| Transparent | Describe the architecture honestly: what is local, what syncs, what is encrypted. |
| Precise | Prefer specific over general. "AES-GCM 256-bit" over "encrypted". |
| Non-patronizing | Do not explain basic dental concepts. Clinicians know their field. |

### Prohibited tones

| Avoid | Example of what to avoid |
|-------|--------------------------|
| Startup AI hype | "Supercharge your clinical workflow with cutting-edge AI" |
| Enterprise compliance theater | "Our robust, enterprise-grade HIPAA-compliant solution ensures..." |
| Fear-based warnings | "Warning: your data may not be protected unless you enable..." |
| Conversational assistant voice | "Hi! I'm ready to help you with today's cases." |
| Liability-panic disclaimers | Stacked warning boxes before every clinical input |
| Marketing vagueness | "Intelligent. Accurate. Trusted." |

### Trust-surface tone standard

Passive trust surfaces (status indicators, input transparency lines, encryption state labels) should be:

- **Quiet** — never draw attention to themselves
- **Factual** — state what is true, not what is reassuring
- **Integrated** — feel like infrastructure, not notifications
- **Consistent** — same language across all surfaces

The test: a trust surface that calls attention to itself has failed.

---

## 8. Future Review Process

### Pre-release terminology check

Before every production release, run this checklist:

- [ ] Grep codebase for all prohibited phrases in Section 6
- [ ] Confirm `.ai-boundary` sentence is present and unmodified in `buildAICardStructure`
- [ ] Confirm `#aiInputLine` populates correctly for tooth/bone/hygiene inputs
- [ ] Confirm action labels vs. state labels are not conflated in any new workflow feature
- [ ] Confirm `reportTemplates.js` BRAND object uses canonical product identity terms
- [ ] Confirm no new feature uses "diagnosis", "HIPAA-compliant", or confidence-score language

### When adding AI-adjacent features

Any new feature that touches AI output, AI input, or AI quality metrics must:

1. Confirm canonical AI terminology (Section 3) covers the new surface
2. If new terminology is needed, add it to this document before shipping
3. Never introduce a new AI metric label without reviewing Section 3 first

### When writing legal documents

Privacy Policy and Terms of Service must:

1. Use canonical terms from Sections 2–5 verbatim where applicable
2. Be checked against the prohibited list in Section 6 before legal review
3. Not introduce new product-identity language that diverges from Section 2
4. Reference this document in their internal review process

### When a prohibited phrase is found in production

Fix immediately in the same PR. Do not defer to a follow-up ticket. Terminology drift compounds — a single instance becomes a pattern within two release cycles.

### Document maintenance

Update this document whenever:

- A new canonical term is established
- A new prohibited phrase is identified
- A legal reviewer requests a terminology change
- A new feature introduces a terminology decision not covered here

Add a dated note inline when a rule changes so reviewers can trace decisions:

> `[2026-05-18] "Mark Ready for Lab" established as canonical action label. "Approve Plan" prohibited.`

---

*Last updated: 2026-05-18 — Phase 3C-i*
