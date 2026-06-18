# Denai — Stable Baseline V1 Certification

> Independent Release Certification Board
> Audit date: 2026-06-18
> Auditor role: Independent — no prior session context assumed, evidence-only

---

## Certification Verdict

**B — CERTIFIED WITH CONDITIONS**

Denai is certified to enter the Clinical Validation Phase subject to four
time-bounded conditions listed in Section 8. Unrestricted clinical use is not
authorized until all conditions are closed.

---

## 1. Executive Summary

Three production-critical bugs have been identified, fixed, and verified
across the beta-hardening cycle. The data persistence layer is correct. The
authentication infrastructure is working. The cloud sync model is sound. The
deployment pipeline is rationalized.

The certification board finds that the core stability requirements for an
initial supervised Clinical Validation Phase have been met. However, four
conditions exist — one involving an active known clinical rendering defect
(bug-172), one involving stale operational documentation, and two involving
internal record-keeping integrity — that must be resolved before unrestricted
clinical use.

---

## 2. Repository State at Certification

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD SHA | `dcc05c7` |
| Remote sync | Up to date with `origin/main` |
| Staged files | None |
| Unstaged files | `.wolf/anatomy.md`, `.wolf/buglog.json` (OpenWolf artifacts — non-application) |
| Untracked files | None |
| Stash | `stash@{0}` — stale `.wolf/anatomy.md` edit from 2026-06-13, non-blocking |

**Branch status:**

| Branch | SHA | Remote sync |
|---|---|---|
| `main` | `dcc05c7` | Synced |
| `beta-hardening` | `dcc05c7` | Synced |
| `wave-1-foundation` | `f1f963f` | Synced — old dev branch, all work in `main` |
| `wave5-hardening` (local) | `e91aae8` | 1 commit ahead of remote — orphaned dev branch |

**Repository cleanliness assessment:** ACCEPTABLE for certification. The only
deviations from a pristine state are (a) two unstaged OpenWolf metadata files,
(b) a stale stash touching only a metadata file, and (c) a local dev branch
one commit ahead of its remote. None of these affect the application.

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

---

## 4. Closed Issues

| Bug | Title | Status |
|---|---|---|
| bug-167 | Production schema drift, missing grants, RLS recursion | **CLOSED** — verified in production |
| bug-168 | Treatment plan renderer inconsistency | **CLOSED** — verified by test suite |
| bug-169 | Dashboard sync indicator stale on async auth | **CLOSED** — verified functionally |
| bug-170 | prefsSync profiles identity mismatch | **CLOSED** — verified 8/8 Playwright; cache invalidated |
| bug-179 | Browser cache serving pre-fix prefsSync.js | **CLOSED** — version bump committed and pushed |

---

## 5. Remaining Risks and Open Items

### CONDITION 1 — Active clinical rendering defect (bug-172) [BLOCKS UNRESTRICTED USE]

**bug-172: Restorative timeline slot-key inversion**

Status per buglog: `NOT FIXED — out of scope for bug-168`
Tags: `treatment-plan, restorative, timeline, material, slot-key-inversion, pre-existing`

This defect was discovered during bug-168 investigation and explicitly deferred.
When a clinician selects a restorative treatment path, the Treatment Plan view may
display incorrect timeline and material information due to a slot-key inversion in
the restorative rendering path.

**Clinical risk:** A clinician reviewing the Treatment Plan view for a restorative
case could be presented with incorrect procedural steps or material specifications.
This does not affect data persistence, diagnosis logic, or the AI recommendation
engine — but it affects the display used for clinical decision review.

**Certification ruling:** This defect must be fixed and verified before unrestricted
clinical use. Clinical Validation Phase entry is permitted under the condition that
all validation cases during this phase avoid the restorative treatment path until
bug-172 is closed. Supervised validation cases using implant and bridge paths are
not affected.

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

1. The three bugs targeted in the beta-hardening cycle are genuinely fixed and verified
   by independent evidence (SQL verification results, 8/8 Playwright tests, functional
   validation logs).

2. The fix to bug-170 (prefsSync identity) resolves a defect that caused cloud
   preferences sync to silently fail for every user since Wave 7F. This is the most
   consequential reliability fix in the cycle. The cache invalidation patch was
   correctly executed and verified.

3. The data persistence model (localStorage + Supabase upsert) is now internally
   consistent with the schema. `profiles.id = auth.uid()` is correctly implemented
   everywhere in the sync path.

4. The deployment infrastructure (Netlify, `netlify.toml`, version-string cache model)
   is rationalized and documented. The operational playbooks (deployment validation,
   rollback) exist and are actionable.

5. The test artifacts from bug-170 (`tests/ci/_bug170_release_gate.spec.js`) are
   committed as permanent regression coverage for the most critical sync path.

**Against unrestricted certification:**

1. Bug-172 is an active known clinical rendering defect in the restorative path. A
   certification board that "assumes failure" cannot certify unrestricted clinical
   use with a known wrong-display defect in clinical decision views.

2. The buglog — the primary institutional memory for defect tracking — contains
   three materially wrong entries, including one that misrepresents a closed critical
   production incident as still open.

3. The release checklist was not formally executed. No git tag marks this baseline.

**Balancing judgment:**

Clinical Validation Phase implies controlled, supervised use with professional
oversight. It is not the same as general availability. The bugs that would
create undetected risk in unsupervised use (silent data corruption in bug-170,
full feature unavailability in bug-167) are resolved. The remaining clinical
rendering defect (bug-172) is in a path that can be excluded from initial
validation cases. Under these conditions, conditional certification is
appropriate and a full rejection would be disproportionate.

---

## 7. Current Roadmap Position

Based on commit history and tag lineage:

| Tag | Milestone |
|---|---|
| `v1.0-stable-monolith` | Core clinical engine stable |
| `v1.5-pre-pilot-stable` | Pre-pilot readiness |
| `v1.7-supervised-pilot-ready` | Supervised pilot entry |
| `v1.8-supervised-pilot-baseline` | Supervised pilot baseline |
| `dcc05c7` (current, untagged) | **Post-beta-hardening: Stable Baseline V1** |

The project has completed a beta-hardening cycle that resolved three
production-blocking defects. The current state represents the first deployment
where cloud sync, preferences persistence, and clinic session management are all
simultaneously functional. This is the appropriate entry point for Clinical
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

**Must be avoided until bug-172 is closed:**
- [ ] Do not use restorative treatment path (implant/bridge paths are safe)
- [ ] Do not rely on Treatment Plan view for restorative cases during this phase

**Recommended operational precaution:**
- [ ] All validation cases should be conducted with DevTools Console open,
      monitoring for `[denai EB]` or `PGRST` errors
- [ ] Report any console errors before proceeding with a case

---

## 9. Recommended Git Tag

```
stable-baseline-v1
```

**Alternative if a date-scoped tag is preferred:**

```
clinical-validation-baseline-2026-06
```

The board recommends `stable-baseline-v1` as the primary tag. It is descriptive,
unambiguous, and matches the milestone name. Apply to `dcc05c7` on `main`.

**Do NOT apply the tag until Condition 1 (bug-172) has at least an acknowledged
plan with a committed fix timeline.** The tag should mark the state that enters
Clinical Validation Phase, not a state with an unacknowledged clinical rendering
defect.

---

## Final Certification Summary

| Field | Value |
|---|---|
| Verdict | **B — CERTIFIED WITH CONDITIONS** |
| Certification date | 2026-06-18 |
| Certified commit | `dcc05c7` |
| Certified branch | `main` (and `beta-hardening` at same SHA) |
| Recommended tag | `stable-baseline-v1` |
| Tag authorization | Conditional — pending bug-172 plan acknowledgement |
| Transition authorized | Clinical Validation Phase — supervised, implant/bridge paths only |
| Unrestricted clinical use | NOT AUTHORIZED until Condition 1 (bug-172) is closed |
| Conditions remaining | 4 (1 blocking unrestricted use, 3 administrative) |
