# Denai — Stable Baseline V1 Certification

> Independent Release Certification Board
> Audit date: 2026-06-18
> Amendment date: 2026-06-19
> Auditor role: Independent — no prior session context assumed, evidence-only

---

## Amendment — 2026-06-19

Condition 1 (bug-172 — restorative slot-key inversion) was resolved in commit
`533c54e` on 2026-06-18. This amendment updates the certification to reflect that
closure.

| Field | Original (2026-06-18) | Updated (2026-06-19) |
|---|---|---|
| Verdict | B — CERTIFIED WITH CONDITIONS | **A — CERTIFIED** |
| HEAD SHA | `dcc05c7` | `533c54e` |
| Blocking conditions | 1 (bug-172) | 0 |
| Recommended tag commit | `dcc05c7` | `533c54e` |
| Restorative path restriction | Active | **Lifted** |
| Unrestricted clinical use | Not authorized | **Authorized for supervised Clinical Validation Phase** |

Administrative Conditions 2, 3, 4 remain open and are non-blocking per the
original certification classification.

---

## Certification Verdict

**A — CERTIFIED**

Denai is certified to enter the Clinical Validation Phase. All treatment paths —
implant, bridge, crown, and restorative — are authorized for supervised clinical
validation. The sole blocking condition from the original certification (Condition 1,
bug-172) was resolved in commit `533c54e` on 2026-06-18.

---

## 1. Executive Summary

Three production-critical bugs were identified, fixed, and verified across the
beta-hardening cycle. A fourth bug (bug-172), a clinical rendering defect discovered
during the cycle, was deferred from bug-168 and subsequently fixed as a separate
remediation effort, closing the final blocking condition for Clinical Validation entry.

The data persistence layer is correct. The authentication infrastructure is working.
The cloud sync model is sound. The deployment pipeline is rationalized. All targeted
defects are closed. The certification board finds that the stability requirements for
supervised Clinical Validation Phase have been fully met.

---

## 2. Repository State at Certification

| Field | Value |
|---|---|
| Branch | `main` / `beta-hardening` (synchronized) |
| HEAD SHA | `533c54e` |
| Remote sync | Both branches up to date with their respective remotes |
| Staged files | None |
| Unstaged files | `.wolf/anatomy.md`, `.wolf/buglog.json` (OpenWolf artifacts — non-application) |
| Untracked files | None |
| Stash | `stash@{0}` — stale `.wolf/anatomy.md` edit from 2026-06-13, non-blocking |

**Branch status:**

| Branch | SHA | Remote sync |
|---|---|---|
| `main` | `533c54e` | Synced — fully merged with `beta-hardening` |
| `beta-hardening` | `533c54e` | Synced |
| `wave-1-foundation` | `f1f963f` | Synced — old dev branch, all work in `main` |
| `wave5-hardening` (local) | `e91aae8` | 1 commit ahead of remote — orphaned dev branch |

**Repository cleanliness assessment:** CLEAN for certification. The only deviations
from a pristine state are (a) two unstaged OpenWolf metadata files, (b) a stale stash
touching only a metadata file, and (c) a local dev branch one commit ahead of its
remote. None of these affect the application.

---

## 3. Release History

### bug-167 — Production schema drift, missing grants, RLS recursion

| | |
|---|---|
| Commit | `8e36a87` (recovery package), `b5a62f7` (Phase E fix artifacts), `c37cde8` (resolution report) |
| Dates | 2026-06-13 through 2026-06-16 |
| Root cause | Production project `dwwtbumwojzohclzxson` pointed to by bug-146 with no schema migration. Four tables missing, all grants absent, Phase E RLS mutual recursion (42P17) |
| Fix scope | Recovery SQL applied to production Supabase project: tables created, grants applied, SECURITY DEFINER helper functions deployed to break RLS cycle |
| Verification | SQL V1–V4 all PASS. Functional validation: clinic creation, membership, persistence, hydration, owner visibility — all confirmed |

### bug-168 — Treatment plan renderer inconsistency

| | |
|---|---|
| Commit | `539df50` |
| Date | 2026-06-12 |
| Root cause | `renderPlanView()` derived all output from `ai.rec` (AI recommendation); `S.tx` (clinician selection) was ignored. Clinician-selected treatment was correctly stored but not displayed |
| Fix scope | `src/render/planFragments.js` + `index.html`: `_planEffectiveAi()` helper introduced; plan view now uses `S.tx` when divergent from `ai.rec` |
| Verification | 18 functional assertions, 43 policy assertions, 56 presenter assertions — all PASS |

### bug-169 — Dashboard sync indicator stale on async auth transitions

| | |
|---|---|
| Commit | `3b05b40` |
| Date | 2026-06-16 |
| Root cause | Dashboard footer sync indicator was only updated on view navigation. Sign-in completion fired asynchronously after the dashboard was mounted — no mechanism to re-render the indicator post-auth |
| Fix scope | `src/auth/authModule.js`: `onStatusChange` subscriber system added. `index.html`: `_updateDashSyncIndicator()` extracted and wired to `denaiAuth.onStatusChange()` |
| Verification | Functional validation during bug-167 post-fix session. Regression check T8/T8b/T8c in `tests/ci/_bug170_release_gate.spec.js` |

### bug-170 — prefsSync profiles identity mismatch

| | |
|---|---|
| Fix commit | `5fe2515` |
| Cache invalidation commit | `dcc05c7` |
| Dates | 2026-06-17 (fix), 2026-06-18 (cache invalidation) |
| Root cause | `src/sync/prefsSync.js` used `user_id` in upsert payload, `onConflict`, and `hydrate` filter. The `profiles` table has no `user_id` column — its PK is `id uuid REFERENCES auth.users(id)`. Cloud preferences sync silently failed on every call since the module was introduced (Wave 7F) |
| Fix scope | 3 lines in `src/sync/prefsSync.js`: `user_id` → `id` on lines 120, 129, 163 |
| Cache fix | `index.html` line 114: `prefsSync.js?v=2.0.0` → `?v=2.0.1`. Required because Netlify serves `/src/**` with `Cache-Control: public, max-age=31536000, immutable` — without a version bump, browsers would execute the stale pre-fix file for up to 365 days |
| Verification | 8/8 Playwright tests PASS (in-page capture mock): payload uses `id` not `user_id`; `onConflict` targets `id`; hydrate filters on `id`; all preference fields present; no console errors |

### bug-172 — Restorative slot-key inversion in Treatment Plan rendering

| | |
|---|---|
| Commit | `533c54e` |
| Date | 2026-06-18 |
| Root cause | `clinicalEngine.js buildRestorativeResult()` uses slot keys (`'implant'`/`'bridge'`/`'crown'`) as `rec` values for backward-compat with `S.tx`. In restorative mode, `'implant'` means slot1/conservative — not a titanium implant. Four rendering consumers checked `ai.rec === 'implant'` as a proxy for surgical intent, which is the wrong discriminator. `recTreatmentId` was absent from the `ai` object, leaving consumers no way to distinguish slot-key from treatment semantics. A secondary defect in `explainLayer.js` caused bone grafting and specialist referral signals to fire incorrectly for conservative restorative cases |
| Fix scope | (1) `clinicalEngine.js`: `recTreatmentId = bySlot[recResult.rec]?.id \|\| null` added to `buildRestorativeResult()` return. (2) `planFragments.js`: `selTreatmentId` lookup propagated in `_planEffectiveAi()`. (3) `index.html` `_getPlanTimeline()`: `isSurgical = ai.recTreatmentId === 'extract_impl'`. (4) `index.html` `_getPlanMaterialSummary()`: same discriminator. (5) `index.html` `_deriveLabMaterial()`: `isExtractImplSlot` guard added. (6) `explainLayer.js` `_buildReferralSignals()`: both `ai.rec === 'implant'` predicates replaced with `ai.recTreatmentId === 'extract_impl'` |
| Verification | Production validation passed. Production certification passed |

---

## 4. Closed Issues

| Bug | Title | Status |
|---|---|---|
| bug-167 | Production schema drift, missing grants, RLS recursion | **CLOSED** — verified in production |
| bug-168 | Treatment plan renderer inconsistency | **CLOSED** — verified by test suite |
| bug-169 | Dashboard sync indicator stale on async auth | **CLOSED** — verified functionally |
| bug-170 | prefsSync profiles identity mismatch | **CLOSED** — verified 8/8 Playwright; cache invalidated |
| bug-172 | Restorative slot-key inversion in Treatment Plan rendering | **CLOSED** — commit `533c54e`, production validation passed |
| bug-179 | Browser cache serving pre-fix prefsSync.js | **CLOSED** — version bump committed and pushed |

---

## 5. Remaining Risks and Open Items

### CONDITION 1 — Active clinical rendering defect (bug-172) ~~[BLOCKS UNRESTRICTED USE]~~ [RESOLVED]

**Resolved in commit `533c54e` on 2026-06-18.**

The restorative slot-key inversion defect has been fixed. The `recTreatmentId` field
is now propagated through the engine and consumed by all four previously defective
rendering sites. The restorative treatment path restriction imposed by this condition
is lifted. See Section 3 (bug-172 entry) for full fix scope.

### CONDITION 2 — Operational documentation stale after bug-170 cache patch [NON-BLOCKING]

`docs/deployment-validation.md` Section 1 references `src/sync/prefsSync.js?v=2.0.0`
as the expected URL. The deployed version is now `?v=2.0.1` (commit `dcc05c7`).
Anyone executing the deployment validation checklist against this document will
encounter a false discrepancy at Step 1.

**Required action:** Update `docs/deployment-validation.md` to reference `?v=2.0.1`.

### CONDITION 3 — Buglog integrity degraded [NON-BLOCKING]

The following `buglog.json` entries contain inaccurate data:

| Entry | Problem |
|---|---|
| `bug-167` | `fix` field says "NOT FIXED". Bug-167 was resolved in production. Entry was written during the initial forensic audit and never updated. |
| `bug-169` | Auto-generated entry. File: `src/render/planFragments.js`. Root cause: "Null/undefined access". This is not bug-169. The actual bug-169 (sync status indicator) has no accurate log entry. |
| `bug-170` | Auto-generated entry. Root cause: "Wrong reference: Recommended → PRIMARY". This is not bug-170. The actual bug-170 (prefsSync identity mismatch) has its accurate data in `bug-179` instead. |

**Required action:** Correct the three entries. This does not affect the application
but degrades the integrity of the historical incident record.

### CONDITION 4 — Release checklist Gate 11 not executed [NON-BLOCKING]

The release checklist (`docs/release-checklist.md`) specifies applying a git tag
at Gate 11 (e.g., `v2.0.0`) and matching the `?v=` string in `index.html` to the
tag version. No `v2.x` tag exists in the repository. The most recent tag is
`v1.8-supervised-pilot-baseline`. Additionally, the checklist states 50 versioned
references in `index.html` but `grep -c "?v=" index.html` returns 63 — 13 more
than documented (likely added in Wave B and Wave C without a checklist update).

**Required action:** Apply the tag recommended in Section 9. Update the asset
count in the release checklist.

### bug-173 — Clinic name hydration (known limitation)

Status: `NOT FIXED — investigation only`

Clinic name hydration may not fall back to localStorage when the cloud is
unavailable. This is a resilience gap, not a data-corruption risk. Acceptable
for supervised Clinical Validation Phase where cloud connectivity is expected.

---

## 6. Certification Rationale

**In favor of certification:**

1. All five bugs targeted or discovered in the beta-hardening cycle are genuinely
   fixed and verified by independent evidence: SQL verification results, 8/8
   Playwright tests, functional validation logs, and production validation confirmation.

2. The fix to bug-170 (prefsSync identity) resolves a defect that caused cloud
   preferences sync to silently fail for every user since Wave 7F. This is the most
   consequential reliability fix in the cycle. The cache invalidation patch was
   correctly executed and verified.

3. The fix to bug-172 (restorative slot-key inversion) resolves the sole clinical
   rendering defect discovered during the cycle. The `recTreatmentId` approach
   recommended in `docs/investigations/bug-172-remediation-review.md` was implemented
   precisely as specified. All treatment paths now display correct procedural steps,
   materials, and referral signals.

4. The data persistence model (localStorage + Supabase upsert) is now internally
   consistent with the schema. `profiles.id = auth.uid()` is correctly implemented
   everywhere in the sync path.

5. The deployment infrastructure (Netlify, `netlify.toml`, version-string cache model)
   is rationalized and documented. The operational playbooks (deployment validation,
   rollback) exist and are actionable.

6. The test artifacts from bug-170 (`tests/ci/_bug170_release_gate.spec.js`) are
   committed as permanent regression coverage for the most critical sync path.

**Against unrestricted certification:**

1. The buglog — the primary institutional memory for defect tracking — contains
   three materially wrong entries, including one that misrepresents a closed critical
   production incident as still open. (Non-blocking; does not affect the application.)

2. The release checklist was not formally executed at Gate 11. No `v2.x` tag marks
   this baseline. (Non-blocking; administrative.)

**Balancing judgment:**

All clinical safety requirements are met. The two remaining concerns are
administrative in nature and do not reflect any unresolved defect, data integrity
risk, or deployment risk. Full certification is appropriate.

---

## 7. Current Roadmap Position

Based on commit history and tag lineage:

| Tag | Milestone |
|---|---|
| `v1.0-stable-monolith` | Core clinical engine stable |
| `v1.5-pre-pilot-stable` | Pre-pilot readiness |
| `v1.7-supervised-pilot-ready` | Supervised pilot entry |
| `v1.8-supervised-pilot-baseline` | Supervised pilot baseline |
| `533c54e` (current, untagged) | **Post-beta-hardening: Stable Baseline V1** |

The project has completed a beta-hardening cycle that resolved four production-blocking
or clinically-impacting defects. The current state represents the first deployment where
cloud sync, preferences persistence, clinic session management, and restorative rendering
are all simultaneously correct. This is the appropriate entry point for Clinical
Validation Phase.

---

## 8. Clinical Validation Entry Criteria

The following criteria must be met before each validation case during Clinical
Validation Phase:

**Must be satisfied before any validation case:**
- [ ] Signed-in session established (auth working)
- [ ] Dashboard sync indicator shows "Synced — signed in as {email}" after
      navigation to the dashboard view (bug-169 regression check)
- [ ] Clinic name appears in clinic context after page reload (bug-167 persistence check)

**All treatment paths authorized (bug-172 resolved):**
- [x] Implant path — authorized
- [x] Bridge path — authorized
- [x] Crown / restorative path — authorized (restriction lifted by `533c54e`)

**Recommended operational precaution:**
- [ ] All validation cases should be conducted with DevTools Console open,
      monitoring for `[denai EB]` or `PGRST` errors
- [ ] Report any console errors before proceeding with a case

---

## 9. Recommended Git Tag

```
stable-baseline-v1
```

**Target commit:** `533c54e` on `main` (and `beta-hardening`, which is synchronized).

> Note: The original certification (2026-06-18) recommended this tag on `dcc05c7`.
> That recommendation was written before bug-172 was fixed. The correct target is
> `533c54e` — the commit that resolved the final blocking condition and represents
> the complete, clinically-valid baseline.

**Alternative if a date-scoped tag is preferred:**

```
clinical-validation-baseline-2026-06
```

---

## Final Certification Summary

| Field | Value |
|---|---|
| Verdict | **A — CERTIFIED** |
| Original certification date | 2026-06-18 |
| Amendment date | 2026-06-19 |
| Certified commit | `533c54e` |
| Certified branches | `main`, `beta-hardening` (synchronized) |
| Recommended tag | `stable-baseline-v1` |
| Tag target | `533c54e` |
| Tag authorization | **AUTHORIZED — no blocking conditions remain** |
| Transition authorized | Clinical Validation Phase — all treatment paths |
| Unrestricted clinical use | Authorized for supervised Clinical Validation Phase |
| Blocking conditions remaining | 0 |
| Administrative conditions remaining | 3 (Conditions 2, 3, 4 — non-blocking) |
