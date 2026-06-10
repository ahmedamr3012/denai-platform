# Founding Clinic Operations Runbook

> Wave B2E (2026-06-10). The complete operator guide for founding-clinic trial
> provisioning, extension, inspection, recovery, and founding-phase exit.
>
> **Audience:** any operator with access to the Supabase dashboard. No source-code
> knowledge required. Every procedure is deterministic: exact SQL, expected
> outcome, verification step.
>
> **Authoritative environment:**
> - Supabase project ref: `dwwtbumwojzohclzxson` (verified 2026-06-10 — never hand-type;
>   copy from this document or the dashboard)
> - SQL editor: https://supabase.com/dashboard/project/dwwtbumwojzohclzxson/sql
> - Production app: https://denai.netlify.app (deploys are MANUAL — see §7)
>
> **Safety model recap (what protects you):**
> - All trial writes go through the service role (Studio SQL editor). Clients
>   cannot write `clinic_subscriptions` at all (no RLS write policies since Phase 12).
> - The client derives trial expiry on-device (`trialing` + past `trial_ends_at`
>   = expired), so a clinic's access flips correctly even if server-side expiry
>   never runs.
> - Expired/canceled clinics keep full access to existing patients, plans,
>   reports, and export. Only creation of new patients/plans is paused. You
>   cannot lock a clinic out of their data with any procedure in this document.

---

## 1. Provisioning Runbook — start a founding-clinic trial

### Prerequisites
- The clinic owner has signed up in the app and created their clinic
  (Account panel → Clinic → Create). Without this there is no clinic row.
- You know the owner's sign-up email.

### Step 1 — Find the clinic ID

```sql
SELECT c.id AS clinic_id, c.name, u.email AS owner_email, c.created_at
FROM clinics c
JOIN auth.users u ON u.id = c.owner_user_id
WHERE u.email = 'owner@example.com';   -- ← owner's sign-up email
```

**Expected:** exactly one row. Copy `clinic_id`.
- Zero rows → the owner hasn't created a clinic yet (or signed up with a
  different email). Do not proceed.
- Two or more rows → unexpected (one clinic per user in the current model).
  Stop and investigate before provisioning.

### Step 2 — Start the trial

```sql
SELECT start_clinic_trial('<clinic_id>', 30);   -- 30-day founding trial
```

- The second argument is trial length in days; omitting it gives 14.
- Founding-clinic default: **30**.

**Behavior matrix (built into the function — safe to re-run):**

| Existing row status        | Effect of the call                                   |
|----------------------------|------------------------------------------------------|
| no row                     | creates `trialing`, ends now + N days                |
| `trialing`                 | **silent no-op** — does NOT extend (see §2 for that) |
| `active`                   | **silent no-op** — never downgrades a paid clinic    |
| `canceled` / `past_due` / `incomplete` / NULL | re-activates: `trialing`, fresh N-day window |

### Step 3 — Verify (server)

```sql
SELECT clinic_id, status, trial_ends_at, updated_at
FROM clinic_subscriptions
WHERE clinic_id = '<clinic_id>';
```

**Expected:** `status = 'trialing'`, `trial_ends_at` ≈ now + N days,
`updated_at` ≈ now.

### Step 4 — Verify (client)

Ask the clinic (or test yourself with their account) to **reload the app while
signed in** — subscription state is loaded once per page load, so an open tab
will not pick up the change until reload (or within sync of the next sign-in).

Visible result:
- Sidebar footer: **"Trial — 30 days left"**
- Account panel → Subscription: **"Trial period — Your trial ends <date>…"**

Console check (F12 → Console), definitive:

```js
denaiAccessPolicy.getEffectiveSubscriptionStatus()   // → 'trialing'
denaiAccessPolicy.isEntitledClinic()                 // → true
denaiEntitlements.getTrialEndsAt()                   // → '2026-07-10T…' (ISO)
```

---

## 2. Extension Runbook — extend, correct, or re-grant trial time

### ⚠️ The #1 operator trap

`start_clinic_trial()` **does nothing** when the clinic is already `trialing`
— it returns `void` with **no error and no notice**. It looks like it worked.
Extending an in-progress trial requires a direct UPDATE.

### 2a. Extend an in-progress trial by N days

```sql
UPDATE clinic_subscriptions
SET trial_ends_at = trial_ends_at + interval '14 days'
WHERE clinic_id = '<clinic_id>'
  AND status = 'trialing'
RETURNING clinic_id, status, trial_ends_at;
```

**Expected:** 1 row returned with the new `trial_ends_at`.
0 rows returned → the clinic is not `trialing` (check §3 inspection; a lapsed
clinic is re-activated with `start_clinic_trial`, not extended).

### 2b. Set an exact end date (correcting a wrong trial length)

```sql
UPDATE clinic_subscriptions
SET trial_ends_at = '2026-07-15T00:00:00Z'
WHERE clinic_id = '<clinic_id>'
  AND status = 'trialing'
RETURNING clinic_id, status, trial_ends_at;
```

Use a UTC timestamp. The client compares against the device clock; end dates
at midnight UTC display as the prior calendar day in western-hemisphere
timezones — pick midday UTC if the exact displayed date matters.

### 2c. Re-activate after expiry (accidental or natural)

Server-side expiry (`expire_trialing_subscriptions()`) sets `status='canceled'`.
A lapsed clinic that should get more time:

```sql
SELECT start_clinic_trial('<clinic_id>', 14);  -- fresh 14-day window from NOW
```

This is the supported path (the function re-activates canceled/past_due/
incomplete rows). Note the window restarts from now — it does not resume the
old window.

### Verification & rollback for all extension operations

- Verify: §1 Step 3 + Step 4 (reload required on the client).
- Rollback: every operation above is a single-row `trial_ends_at`/`status`
  write; to undo, set the previous values with 2b (the prior values are in the
  `RETURNING` output / your scrollback — copy them before closing the editor).

---

## 3. Clinic State Inspection — one query, full picture

### 3a. Server-side: the standard inspection query

```sql
SELECT c.id AS clinic_id, c.name, u.email AS owner_email,
       s.status            AS stored_status,
       s.trial_ends_at,
       s.current_period_ends_at,
       s.plan_id,
       s.external_billing_id,
       s.updated_at,
       CASE
         WHEN s.clinic_id IS NULL THEN 'none'
         WHEN s.status = 'trialing' AND s.trial_ends_at < now() THEN 'expired (derived)'
         ELSE coalesce(s.status, 'none')
       END AS effective_status
FROM clinics c
LEFT JOIN clinic_subscriptions s ON s.clinic_id = c.id
JOIN auth.users u ON u.id = c.owner_user_id
ORDER BY c.created_at;
```

`effective_status` mirrors the client's derivation in `accessPolicy.js`
exactly: a `trialing` row past its end date is treated as expired by every
device regardless of what `stored_status` says.

Entitlement meaning of `effective_status` (founding phase ON):

| effective_status      | Can create new patients/plans? | What the clinic sees |
|-----------------------|--------------------------------|----------------------|
| `none`                | YES (founding policy)          | no subscription chrome at all |
| `trialing`            | YES                            | "Trial — N days left" |
| `active`              | YES                            | "Active subscription" |
| `past_due`            | YES (dunning grace)            | "Active — payment needs attention" |
| `expired (derived)`   | NO                             | "Trial ended — viewing mode" |
| `canceled`            | NO                             | "Subscription ended — viewing mode" |
| anything else         | NO                             | "No active subscription — viewing mode" |

### 3b. Client-side: console inspection (signed-in browser, F12)

```js
denaiClinicSession.getClinicId()                     // clinic UUID (null = no clinic)
denaiAccessPolicy.getEffectiveSubscriptionStatus()   // what the app ACTS on
denaiAccessPolicy.isEntitledClinic()                 // creation allowed?
denaiAccessPolicy.isFoundingPhase()                  // founding flag as deployed
denaiEntitlements.getStatus()                        // raw stored status (live→cache)
denaiEntitlements.getTrialEndsAt()                   // ISO end date or null
JSON.parse(localStorage.getItem('denaiSubscription_v1'))  // device cache + cachedAt
denaiAuth.getAuthTrail()                             // auth lifecycle, if sign-in is in question
```

---

## 4. Failure Recovery Runbook

| # | Failure | Detection | Recovery |
|---|---------|-----------|----------|
| F1 | **Trial provisioned for the wrong clinic** | §3a shows `trialing` on a clinic that shouldn't have it | `DELETE FROM clinic_subscriptions WHERE clinic_id='<id>' AND status='trialing' AND external_billing_id IS NULL;` — the guard clauses make it impossible to delete a Stripe-linked or paid row. Clinic reverts to `none` (fully entitled while founding phase is ON). Then provision the right clinic per §1. |
| F2 | **Wrong trial length** | `trial_ends_at` not what was intended (§1 Step 3) | §2b — set the exact end date. |
| F3 | **Expired too early** (clock error, wrong date set, premature manual expiry) | Clinic reports "Trial ended" while trial should be live; §3a shows `expired (derived)` or `canceled` | If `trialing` with wrong date → §2b with correct date. If `canceled` → §2c. Client recovers on reload. |
| F4 | **Missing subscription row** | §3a `effective_status = 'none'` | Not an error during founding phase (clinic is entitled, sees no chrome). Provision per §1 when a trial should begin. |
| F5 | **Duplicate subscription rows** | Cannot occur: `clinic_id` is UNIQUE. An INSERT attempt fails with `duplicate key value violates unique constraint` | Use `start_clinic_trial()` (upsert semantics) instead of raw INSERT. Nothing to clean up. |
| F6 | **DB and client disagree** | Console (§3b) shows different status than §3a | 1) Client loads subscription once per page load → **reload the app**. 2) Still wrong → inspect the cache (`denaiSubscription_v1`): a stale cache is overwritten on every successful load; if load is failing, check the browser console for `[denaiClinicSession]` warnings. 3) `expired` on the device but `trialing` in DB with a future date → **check the device clock**. 4) Last resort: `localStorage.removeItem('denaiSubscription_v1')` + reload. |
| F7 | **Provisioning interrupted mid-procedure** | Unsure whether Step 2 ran | `start_clinic_trial` is one atomic statement and idempotent for `trialing`/`active`. Just run §1 Step 3 to see the state; re-run Step 2 freely if no row exists. |
| F8 | **Extension "didn't work"** | `trial_ends_at` unchanged after calling `start_clinic_trial` on a trialing clinic | That call is the §2 trap (silent no-op by design). Use §2a/§2b. |
| F9 | **Stripe webhook overwrote a manual trial** (future, once checkout exists) | `external_billing_id` non-null, status changed | Intended behavior: real billing data is authoritative over manual trials. Do not fight the webhook; manage the subscription in Stripe. |
| F10 | **Clinic deleted by mistake** | clinic row gone | `clinic_subscriptions` row is gone too (FK CASCADE) — subscription state cannot be restored independently; restore the clinic first, then re-provision per §1. |

---

## 5. pg_cron — role, verification, recommendation

**What it does:** the job `expire-trialing-subscriptions` (daily 02:00 UTC)
runs `expire_trialing_subscriptions()`, flipping overdue `trialing` rows to
`canceled` in the database.

**What changed in B2A:** every client derives expiry locally, so **product
behavior no longer depends on pg_cron**. A clinic with an overdue trial loses
creation rights on-device (online or offline) even if the DB row says
`trialing` forever.

**What pg_cron still provides:**
1. DB truth convergence — without it, §3a shows `expired (derived)` indefinitely
   while `stored_status` stays `trialing` (confusing for operators and any
   future server-side consumer/reporting).
2. Defense against devices with a badly wrong clock (server state eventually
   corrects the cache on next load).

**Verification procedure (run in SQL editor):**

```sql
-- 1. Extension enabled?
SELECT extname FROM pg_extension WHERE extname = 'pg_cron';
-- 0 rows → enable: Dashboard → Database → Extensions → pg_cron, then re-run
--          the Phase 14 schedule block from src/db/schema.sql (lines ~1159-1173).

-- 2. Job scheduled?
SELECT jobid, jobname, schedule, active
FROM cron.job WHERE jobname = 'expire-trialing-subscriptions';

-- 3. Actually running? (last 7 runs)
SELECT start_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'expire-trialing-subscriptions')
ORDER BY start_time DESC LIMIT 7;
```

**Manual fallback** (acceptable indefinitely at founding scale — run weekly,
or after any trial's end date passes):

```sql
SELECT expire_trialing_subscriptions();   -- returns count of rows expired
```

**Recommendation:** enable and verify pg_cron once (15 minutes), but treat it
as hygiene, not a launch blocker. The B2A client-side derivation already
protects access behavior; the weekly manual fallback covers DB convergence
until then.

---

## 6. Founding Phase Exit — readiness criteria (evaluation only)

`FOUNDING_PHASE_ENABLED` lives at the top of `src/auth/accessPolicy.js`
(currently `true`). While true, clinics with **no subscription row** retain
full creation rights. Flipping it to `false` makes `none` a restricted state.

Do NOT flip until every item below holds:

1. **Zero unprovisioned founding clinics.** Inventory query — must return no
   rows for clinics that should keep creating:
   ```sql
   SELECT c.id, c.name, u.email
   FROM clinics c
   JOIN auth.users u ON u.id = c.owner_user_id
   LEFT JOIN clinic_subscriptions s ON s.clinic_id = c.id
   WHERE s.clinic_id IS NULL;
   ```
2. **A conversion path exists** — either self-serve checkout (post-B2 scope) or
   the documented manual comp:
   ```sql
   UPDATE clinic_subscriptions
   SET status = 'active', current_period_ends_at = '<date>'
   WHERE clinic_id = '<clinic_id>' AND external_billing_id IS NULL
   RETURNING *;
   ```
3. **Advance notice sent** to every affected clinic (date + what changes +
   what never changes: historical access).
4. **Flip procedure followed exactly** (it is a `/src/**` edit):
   change the flag → bump `accessPolicy.js` `?v=` in index.html → bump SW
   `CACHE` name → same-commit → merge to `main` → manual Netlify deploy →
   live-artifact verification (§7) → console check
   `denaiAccessPolicy.isFoundingPhase()` → `false`.
5. **Rollback ready:** revert the flag with the identical procedure. The test
   suites are flip-agnostic (they exercise the policy with explicit flag
   arguments), so both states stay verified.

---

## 7. Deployment discipline (applies to every procedure touching code)

This site deploys **manually** — pushing to GitHub does nothing (bug-146).
A change is live only after:

1. Merge to `main` and push.
2. `netlify deploy --prod` (or dashboard drag-and-drop).
3. Live-artifact verification, e.g.:
   `curl https://denai.netlify.app/src/auth/accessPolicy.js` shows the new content,
   and view-source of `/` shows the expected `?v=` strings and SW `CACHE` name.

Never report a fix/flip as done based on git state alone.
