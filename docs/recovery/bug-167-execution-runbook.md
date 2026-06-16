# bug-167 — Production Schema Recovery Runbook

> Operator guide for applying `bug-167-recovery.sql` to the Denai production
> Supabase project. Written for an operator who did **not** build Denai.
> Read this entire document before running anything.

---

## 1. Purpose

The production Supabase project **`dwwtbumwojzohclzxson`** is missing a large
portion of the application schema. The app was repointed to this project (bug-146)
but the schema was never migrated to it. As a result:

- The tables `clinics`, `clinic_members`, `clinic_subscriptions`,
  `workflow_observations` **do not exist**.
- The column `patients.clinic_id` **does not exist**.
- The functions `start_clinic_trial()`, `expire_trialing_subscriptions()`,
  `upsert_clinic_subscription()` **do not exist**.
- The database role `authenticated` (used by every signed-in app request) **has
  no table privileges**, so even the existing `patients`/`profiles` tables return
  `42501 permission denied`.

User-visible symptom: creating or renaming a clinic silently fails and reverts;
cloud features do not persist.

This recovery applies the missing tables, columns, indexes, RLS policies, and
functions (verbatim from the repository source of truth `src/db/schema.sql`),
plus the grant layer that the source of truth does not contain. It is **additive
and idempotent**: it creates only what is missing and changes no existing data.

---

## 2. Preconditions

Before starting, confirm ALL of the following:

| # | Precondition | How to check |
|---|---|---|
| 1 | You can open the **SQL Editor** for project `dwwtbumwojzohclzxson` in the Supabase Dashboard | Dashboard → SQL Editor |
| 2 | You are running as a privileged role (`postgres`) | The SQL Editor uses `postgres` by default |
| 3 | You have the three recovery files | `bug-167-recovery.sql`, `bug-167-verification.sql`, this runbook |
| 4 | (Optional, for Phase G) `pg_cron` is enabled | Dashboard → Database → Extensions → search `pg_cron` |
| 5 | No other migration is mid-flight against this project | Coordinate with the team |

**Do not run this against any project other than `dwwtbumwojzohclzxson`.**
Confirm the project ref in the Dashboard URL before pasting any SQL.

---

## 3. Backup recommendations

This migration does not delete or modify data, but take a safety snapshot anyway:

1. **Point-in-Time Recovery / daily backup** — confirm it is enabled
   (Dashboard → Database → Backups). Note the latest restore point timestamp.
2. **Row counts (evidence baseline)** — run and record:
   ```sql
   SELECT 'patients' AS t, count(*) FROM patients
   UNION ALL SELECT 'profiles', count(*) FROM profiles;
   ```
   These counts MUST be unchanged after the migration (it touches no rows).
3. If the project tier supports it, trigger a manual backup immediately before
   execution.

---

## 4. Exact execution sequence

Run **one phase at a time**. After each phase, the recovery file contains an
inline `CHECKPOINT` query — run it and confirm the expected result (stated in the
comment) before moving on. Do **not** paste the whole file and run it blindly.

| Step | Action | Expected checkpoint result |
|---|---|---|
| 1 | Run **PHASE A** block | 4 rows: `clinic_members, clinic_subscriptions, clinics, workflow_observations` |
| 2 | Run **PHASE B** block | 3 rows: `clinic_id, stripe_customer_id, stripe_event_at` |
| 3 | Run **PHASE C** block | 5 rows (the five index names) |
| 4 | Run **PHASE D** block | all columns `true` (schema usage + insert/select privileges) |
| 5 | Run **PHASE E** block | `clinics=4, clinic_members=5, clinic_subscriptions=2, workflow_observations=1` |
| 6 | Run **PHASE F** block | 3 rows (the three function names) |
| 7 | Run **PHASE G** block *(only if `pg_cron` is enabled — else SKIP)* | 1 row: `expire-trialing-subscriptions | 0 2 * * *` |
| 8 | Run **`bug-167-verification.sql`** in full | See §8 below — all checks pass |

Total time: ~5 minutes. Each phase is independently re-runnable.

---

## 5. Expected outputs

- **No errors.** Every statement is guarded (`IF NOT EXISTS`, `EXCEPTION WHEN
  duplicate_object`, `CREATE OR REPLACE`, idempotent `GRANT`). Re-running a phase
  produces no error and no change.
- Each checkpoint returns exactly the row(s) described in the recovery file
  comment for that phase.
- `patients`/`profiles` row counts from §3.2 are **unchanged**.

---

## 6. Failure handling

| Symptom | Cause | Action |
|---|---|---|
| `permission denied to set parameter` / cannot GRANT | Not running as `postgres` | Re-open SQL Editor (default role); do not use a restricted connection |
| Phase G: `extension "pg_cron" is not available` | pg_cron not enabled on this tier | **Skip Phase G.** A–F are complete and valid without it |
| Checkpoint D shows any `false` | Grant did not apply (wrong grantor, or REVOKE elsewhere) | Re-run Phase D; if still false, confirm the executing role owns/holds grant-option on the tables |
| Checkpoint E count too low | A policy name already existed under a different definition | Re-run Phase E (idempotent); inspect `pg_policies` for name collisions |
| `relation "clinics" does not exist` in a later phase | Phase A was skipped or failed | Re-run Phase A first, then continue |
| Any unexpected error | — | **Stop.** Do not proceed to the next phase. Capture the exact error text. Because the migration is additive/idempotent, no partial state is harmful — fix the cause and re-run the failed phase |

**Golden rule:** a phase that errors leaves no harmful partial state (idempotent
guards). Never "force" past an error — diagnose, then re-run the same phase.

---

## 7. Rollback considerations

This migration is additive; rollback is rarely needed. If you must revert:

- **Grants (Phase D)** — metadata only, zero data impact. Reverting returns the
  database to the broken `42501` state:
  ```sql
  -- ROLLBACK-ONLY (not part of forward migration)
  REVOKE SELECT, INSERT, UPDATE, DELETE ON patients              FROM authenticated;
  REVOKE SELECT, INSERT, UPDATE         ON profiles              FROM authenticated;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON clinics               FROM authenticated;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON clinic_members        FROM authenticated;
  REVOKE SELECT                         ON clinic_subscriptions  FROM authenticated;
  REVOKE INSERT                         ON workflow_observations FROM authenticated;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON clinic_subscriptions  FROM service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM service_role;
  ```
- **Tables (Phase A)** — only if they were created empty by this run. ⚠️ Dropping
  `clinics` CASCADEs to `clinic_members`/`clinic_subscriptions` rows and sets
  `patients.clinic_id` to NULL. **Patient rows are never deleted.** Do not drop a
  table that has acquired real clinic data after go-live.
- **Indexes / Policies / Functions** — `DROP INDEX/POLICY/FUNCTION IF EXISTS`;
  zero data impact.
- **pg_cron (Phase G)** — `SELECT cron.unschedule('expire-trialing-subscriptions');`

Reverting `ALTER DEFAULT PRIVILEGES` affects only future tables, not existing grants.

---

## 8. Post-execution validation

1. **Structural** — run `bug-167-verification.sql` in full. Every section must
   return its stated expected result (tables, columns, indexes, policies,
   functions, grants/privileges).
2. **Data integrity** — re-run the §3.2 row-count query; counts unchanged.
3. **Functional (through the app — requires a signed-in user)** — these exercise
   the `authenticated` role and RLS together; they cannot be tested as `postgres`:
   - Sign in → Account → **create a clinic** → expect success (no "Could not
     create clinic"), and the name **persists after a page refresh**.
   - Account panel shows your role badge as **owner**.
   - (Service role, optional) start a trial for the new clinic:
     `SELECT start_clinic_trial('<new_clinic_uuid>');` then reload the app and
     confirm entitlement status reflects `trialing`.
4. **Confirm no console errors** for `PGRST205` / `42703` / `42501` /
   subscription-load failures.

When §8.1–8.4 pass, bug-167 is resolved in production.
