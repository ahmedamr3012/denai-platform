# bug-167 — Resolution Report

> Production schema drift, missing grants, and RLS recursion. Full incident
> lifecycle from discovery through confirmed production resolution.

---

## 1. Executive Summary

Production project `dwwtbumwojzohclzxson` was repointed to by bug-146 without
migrating the application schema or its access-control layer. This left the
clinic/subscription feature set entirely non-functional in production: the
required tables did not exist, the `authenticated` role had no table
privileges, and — once the schema was restored — two RLS policies formed a
mutual recursion loop that PostgreSQL rejected outright.

Three sequential defects were identified and resolved:

1. Missing schema objects (tables, columns, indexes, functions)
2. Missing grants (`authenticated` had zero table privileges on the affected
   tables)
3. RLS recursion between `clinics_select_member` and
   `clinic_members_select_owner_roster` (`42P17`)

All three have been executed against production and verified. Clinic
creation, membership, persistence, hydration, and owner visibility are now
confirmed working end-to-end.

**Status: BUG-167 RESOLVED**

---

## 2. Original Failure Description

User-visible symptom: creating or renaming a clinic silently failed and
reverted in the UI. Cloud-dependent features (clinic membership, subscription
status, trial entitlement) did not persist or load.

Underlying technical symptoms, discovered in sequence:

- `clinics`, `clinic_members`, `clinic_subscriptions`, `workflow_observations`
  did not exist in the production database.
- `patients.clinic_id` did not exist.
- `start_clinic_trial()`, `expire_trialing_subscriptions()`,
  `upsert_clinic_subscription()` did not exist.
- The `authenticated` role had no `SELECT`/`INSERT`/`UPDATE`/`DELETE`
  privilege on any of the affected tables — every request returned `42501
  permission denied` before RLS was ever evaluated.
- After the schema and grants were restored, a structural RLS defect
  surfaced: `42P17 infinite recursion detected in policy`.

---

## 3. Root Cause Analysis

### Missing schema objects

Production project `dwwtbumwojzohclzxson` was set as the application's
target in bug-146, but the schema was never migrated from the original
(now-dead) project. The production database was running an earlier schema
revision lacking the entire clinic/subscription/workflow-observation feature
set introduced in later revisions of `src/db/schema.sql`.

### Missing grants

Even after the schema objects existed, `authenticated` had no table-level
privileges. Supabase's automatic default-privilege behavior — which normally
grants `authenticated`/`service_role` access to newly created tables — was
not active on this project. `src/db/schema.sql` itself contains zero `GRANT`
statements anywhere in its 1173 lines; the schema design assumes Supabase's
default-privilege behavior, which this project did not have. Every table
created on `dwwtbumwojzohclzxson` arrived ungranted.

### Phase E recursive RLS policies

Two policies, both correct in intent, formed a structural cycle:

- `clinics_select_member` needed to ask `clinic_members` whether the
  requesting user was a member (to let members, not just owners, read the
  clinic row).
- `clinic_members_select_owner_roster` needed to ask `clinics` whether the
  requesting user owned the clinic a given membership row belonged to (to let
  an owner see the full roster, not just their own row).

Each was implemented as a cross-table `EXISTS` subquery. Because PostgreSQL
applies RLS policies to subqueries inside other policies, each lookup
re-triggered the other table's RLS evaluation, which re-triggered the first
table's RLS evaluation, without termination.

### 42P17 failure mode

```
SELECT on clinics
  → clinics_select_member evaluates
    → EXISTS (SELECT 1 FROM clinic_members ...)
      → clinic_members_select_owner_roster evaluates
        → EXISTS (SELECT 1 FROM clinics ...)
          → clinics_select_member evaluates
            → 42P17 infinite recursion detected in policy
```

PostgreSQL detects this cycle and raises `42P17` rather than evaluating
indefinitely. The trigger path from the application was `_load()` in
`src/auth/clinicSession.js`, which performs an embedded join
(`.from('clinic_members').select('clinic_id, role, clinics(id, name)')`) —
firing the `clinics` RLS from inside a `clinic_members` query on every
session load for any non-owner member, and on any owner-roster read.

---

## 4. Recovery Timeline

| Stage | Action | Outcome |
|---|---|---|
| 1 | **Recovery package execution** — `bug-167-recovery.sql` Phases A–F applied to `dwwtbumwojzohclzxson`: 4 tables created, `patients.clinic_id` + Stripe columns added, 5 indexes created, RLS policies created (original Phase E definitions), 3 functions created | ✅ SUCCESS |
| 2 | **Grants remediation** — Phase D additive grant layer applied: `USAGE` on schema, `authenticated` DML matched to the Phase E policy surface, `service_role` billing writes, `ALTER DEFAULT PRIVILEGES` for recurrence prevention | ✅ SUCCESS |
| 3 | **Phase E recursion fix** — `bug-167-phase-e-fix.sql` Steps 1–4 applied: two `SECURITY DEFINER` helper functions (`is_clinic_owner`, `is_clinic_member`) created with `search_path` lockdown and least-privilege `EXECUTE` grants; `clinics_select_member` and `clinic_members_select_owner_roster` rewritten to use them | ✅ SUCCESS |

Each stage was preceded by design review, and the Phase E fix specifically
underwent an adversarial review (10 dimensions: SECURITY DEFINER safety,
`auth.uid()` behavior, function ownership, `search_path` safety, EXECUTE
grants, `anon` implications, RLS evaluation behavior, remaining recursion
paths, privilege escalation, overlooked policies) before execution. Two
amendments were required and incorporated prior to execution: `SET
search_path = ''` on both functions, and explicit `REVOKE EXECUTE FROM
PUBLIC` + `GRANT EXECUTE TO authenticated, service_role` only.

---

## 5. Verification Results

All four verification queries from `bug-167-phase-e-fix.sql` were run
post-execution and confirmed PASS.

**V1 — Functions exist, SECURITY DEFINER, search_path locked**

```sql
SELECT p.proname                     AS function_name,
       p.prosecdef                   AS security_definer,
       p.proconfig                   AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_clinic_owner','is_clinic_member')
ORDER BY p.proname;
```
Expected: 2 rows, `security_definer = true`, `config` containing
`search_path=`. **Result: PASS.**

**V2 — EXECUTE grants restricted to authenticated + service_role**

```sql
SELECT p.proname AS function_name,
       a.grantee::regrole::text AS grantee,
       a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
aclexplode(p.proacl) a
WHERE n.nspname = 'public'
  AND p.proname IN ('is_clinic_owner','is_clinic_member')
ORDER BY p.proname, a.grantee::regrole::text;
```
Expected: 4 rows total (2 functions × 2 roles); no `public`/`anon` entries.
**Result: PASS.**

**V3 — Policy bodies updated to non-recursive form**

```sql
SELECT c.relname                                      AS table_name,
       pol.polname                                    AS policy_name,
       pg_get_expr(pol.polqual, pol.polrelid)         AS using_expr
FROM pg_policy pol
JOIN pg_class c     ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND pol.polname IN ('clinics_select_member','clinic_members_select_owner_roster')
ORDER BY c.relname, pol.polname;
```
Expected: `clinics_select_member` → `uid() = owner_user_id OR
is_clinic_member(id)`; `clinic_members_select_owner_roster` →
`is_clinic_owner(clinic_id)`. **Result: PASS.**

**V4 — Functional smoke test**

```sql
SELECT public.is_clinic_owner(gen_random_uuid())  AS should_be_false,
       public.is_clinic_member(gen_random_uuid()) AS should_be_false_2;
```
Expected: both `false` (no JWT claims in the `postgres` execution context).
**Result: PASS.**

---

## 6. Functional Validation

Validated through the live application with a signed-in session:

| Check | Result |
|---|---|
| Authentication | ✅ Sign-in succeeds, session established |
| Clinic creation | ✅ `createClinic()` succeeds — no `42501`, no `42P17` |
| Membership creation | ✅ Owner's `clinic_members` row inserted successfully |
| Reload persistence | ✅ Clinic name and association persist after page refresh |
| Hydration | ✅ `_load()` resolves clinic + role + name via the embedded join without recursion |
| Owner visibility | ✅ Owner role persists after reload; full member roster loads for the owner |

---

## 7. Final Outcome

All three root-cause layers — missing schema, missing grants, recursive RLS
— have been resolved in production and independently verified at both the
SQL level (V1–V4) and the application level (functional validation above).

**BUG-167 RESOLVED**

A separate, unrelated UI-state observation was made during functional
validation (sync status indicator inconsistency between the account modal
and the dashboard footer). This does not affect the schema/grants/RLS
resolution above and is tracked independently — see
`bug-169-sync-status-indicator-mismatch.md`.
