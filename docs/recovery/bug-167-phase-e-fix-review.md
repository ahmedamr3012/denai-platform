# bug-167 Phase E — RLS Recursion Fix Review

> Companion document to `bug-167-phase-e-fix.sql`. Records the incident, root
> cause, recursion chain, and the design/security/authorization review history
> that led to the approved fix.

---

## 1. Incident Summary

After `bug-167-recovery.sql` Phases A–F were applied to production project
`dwwtbumwojzohclzxson` (all phases reported SUCCESS), post-recovery
investigation identified a PostgreSQL RLS error:

```
42P17  infinite recursion detected in policy
```

The error occurs on any query path that triggers both of the following
policies in the same evaluation chain:

- `clinics_select_member` (on `clinics`)
- `clinic_members_select_owner_roster` (on `clinic_members`)

This is triggered in normal application use by `_load()` in
`src/auth/clinicSession.js`, which performs:

```js
.from('clinic_members')
.select('clinic_id, role, clinics(id, name)')
```

The embedded `clinics(id, name)` join fires the `clinics` RLS from inside a
`clinic_members` query — entering the recursive loop on every session load
for any non-owner member, and on any owner-roster read.

---

## 2. Root Cause

Two RLS policies have a mutual cross-table dependency:

- `clinics_select_member` must ask `clinic_members` whether the requesting
  user is a member of the clinic (to allow members, not just owners, to read
  the clinic row).
- `clinic_members_select_owner_roster` must ask `clinics` whether the
  requesting user owns the clinic that a given membership row belongs to (to
  let an owner see the full roster, not just their own row).

Both lookups are implemented as `EXISTS (SELECT 1 FROM <other table> ...)`
subqueries. Because RLS policies are themselves applied to subqueries within
other policies, each lookup re-triggers the other table's RLS evaluation,
which re-triggers the first table's RLS evaluation, indefinitely. PostgreSQL
detects this and raises `42P17` rather than evaluating forever.

This is not a logic bug in the authorization rules themselves — the access
model (owners see their clinic; members see their clinic; owners see the
roster) is correct. The defect is structural: two legitimate, correct rules
were implemented in a way that creates a cycle through standard RLS-gated
subqueries.

---

## 3. Recursion Chain

```
SELECT on clinics
  → clinics_select_member evaluates
    → EXISTS (SELECT 1 FROM clinic_members ...)
      → clinic_members_select_owner_roster evaluates
        → EXISTS (SELECT 1 FROM clinics ...)
          → clinics_select_member evaluates
            → 42P17 infinite recursion detected in policy
```

Five additional Phase E policies were identified during the audit as
containing cross-table `EXISTS` subqueries on `clinics` or `clinic_members`,
but none of them independently recurse — each resolves through one of the two
policies above:

| Policy | Cross-table reference | Resolution path |
|---|---|---|
| `clinic_members_insert_owner` | EXISTS on `clinics` | Through fixed `clinics_select_member` |
| `clinic_members_update_owner` | EXISTS on `clinics` (×2) | Through fixed `clinics_select_member` |
| `clinic_members_delete_owner_or_self` | EXISTS on `clinics` | Through fixed `clinics_select_member` |
| `clinic_subscriptions_select_owner` | EXISTS on `clinics` | Through fixed `clinics_select_member` |
| `clinic_subscriptions_select_member` | EXISTS on `clinic_members` | Through fixed `clinic_members_select_owner_roster` |

Fixing the two root policies resolves all downstream recursion exposure
without modifying any of the five.

---

## 4. Security Review Outcome

The fix introduces two `SECURITY DEFINER` helper functions —
`public.is_clinic_owner(uuid)` and `public.is_clinic_member(uuid)` — that
perform the same boolean checks the original subqueries performed, but query
their target table directly as `postgres`, bypassing RLS for that specific
internal lookup only.

An adversarial review was performed against ten dimensions before approval.
Summary of findings:

| Review area | Outcome |
|---|---|
| PostgreSQL SECURITY DEFINER safety | Safe — functions return boolean only, no data exposure path |
| `auth.uid()` inside SECURITY DEFINER | Safe — reads `request.jwt.claims` session variable, which persists through the SECURITY DEFINER role switch (documented Supabase behavior) |
| Function ownership | Must be created as `postgres` (Supabase SQL Editor default) — documented as an execution constraint |
| `search_path` safety | **Required amendment**: functions must include `SET search_path = ''` and use fully qualified table names (`public.clinics`, `public.clinic_members`) to prevent schema-injection attacks against a superuser-owned SECURITY DEFINER function |
| EXECUTE grants | **Required amendment**: default Postgres behavior grants EXECUTE to PUBLIC; must be explicitly revoked and re-granted only to `authenticated` and `service_role` |
| `anon` role implications | `anon` has no table-level SELECT on `clinics`/`clinic_members` (Phase D grants `authenticated` only) — 42501 fires before RLS, so `anon` never reaches the function call path; `anon` EXECUTE grant is unnecessary and was explicitly excluded |
| RLS evaluation behavior | Confirmed: SECURITY DEFINER functions bypass RLS for their internal lookup only; they do not affect RLS evaluation for the outer query |
| Remaining recursion paths | None — all five other cross-table policies resolve safely through the two fixed policies (see §3 table) |
| Hidden privilege escalation paths | None identified — boolean-only return values, type-safe `uuid` parameters, no SQL injection surface |
| Overlooked policies | All Phase E policies enumerated and traced; no additional recursion sources found |

**Final adversarial verdict:** Safe after minor amendment (the two required
amendments above). Both amendments are incorporated into the persisted fix in
`bug-167-phase-e-fix.sql`.

---

## 5. Authorization Model Review

The fix was reviewed to confirm it changes nothing about who can access what
— only how the check is evaluated internally.

| Rule | Before fix | After fix | Preserved? |
|---|---|---|---|
| Owner sees their own clinic | `auth.uid() = owner_user_id` | Same direct check retained as first OR branch | Yes |
| Member sees their clinic | `EXISTS` subquery on `clinic_members` | `is_clinic_member()` — identical condition, no RLS re-entry | Yes |
| Owner sees full member roster | `EXISTS` subquery on `clinics` | `is_clinic_owner()` — identical condition, no RLS re-entry | Yes |
| `clinic_subscriptions` SELECT-only to `authenticated` | Unchanged | Unchanged | Yes |
| Billing writes restricted to `service_role` | Unchanged | Unchanged | Yes |
| Owner short-circuit during `createClinic()` Step 2 (membership row not yet inserted) | `auth.uid() = owner_user_id` branch allows clinic visibility before the owner's `clinic_members` row exists | Same branch preserved in fixed policy — `is_clinic_member()` is never required to return true for this case | Yes |

No new access was introduced for any role. No existing access was removed
from any role. The fix is a pure evaluation-mechanism change, not an
authorization-policy change.

---

## 6. Final Approval Summary

| Stage | Outcome |
|---|---|
| Recursion root-cause analysis | Confirmed: mutual cross-table EXISTS subqueries between `clinics_select_member` and `clinic_members_select_owner_roster` |
| Design review (Options A–D) | SECURITY DEFINER helper functions (Option B) selected — only option that resolves the cycle without schema changes, application code changes, or functional regression |
| Adversarial review (10 dimensions) | Two required amendments identified: `search_path` lockdown, EXECUTE grant restriction |
| Final migration generation | Both amendments incorporated; execution order, verification suite, and rollback path produced |
| Final self-audit (recursion, privilege escalation, search_path, Supabase compatibility, authorization model) | All dimensions passed |
| **Final verdict** | **SAFE TO EXECUTE** |

This fix has not been executed against production. It exists as an approved,
reviewed, persisted artifact pending operator execution. See
`bug-167-phase-e-fix.sql` for the exact migration, verification suite, and
rollback SQL, and `bug-167-execution-runbook.md` for the original Phase A–F
operator guide (this fix follows the same phase-by-phase, checkpoint-driven
execution discipline).
