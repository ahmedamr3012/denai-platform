-- ============================================================================
-- DENAI — bug-167 PRODUCTION SCHEMA RECOVERY
-- Target project : dwwtbumwojzohclzxson  (Supabase)
-- Source of truth: src/db/schema.sql  (revision 7) — Phases A/B/C/E/F/G are a
--                  VERBATIM extract. Phase D (Grants) is the approved bug-167
--                  remediation layer (principle: grant = RLS policy surface);
--                  schema.sql defines no grants, so Phase D lives only here.
-- ============================================================================
-- SAFETY CONTRACT
--   • Additive + idempotent only. NO DROP / TRUNCATE / DELETE / destructive ALTER.
--   • auth.users is never touched. No patient/profile data is modified.
--   • Re-running any phase is safe (IF NOT EXISTS / EXCEPTION guards / CREATE OR
--     REPLACE / idempotent GRANT).
--
-- EXECUTION MODEL (controlled, phase-by-phase)
--   Run ONE phase block at a time in the Supabase SQL Editor, then run the
--   "CHECKPOINT" query that immediately follows it and confirm the expected
--   result before proceeding to the next phase. The full read-only suite is in
--   docs/recovery/bug-167-verification.sql. Operator steps: see
--   docs/recovery/bug-167-execution-runbook.md.
--
-- MANDATORY ORDER: A → B → C → D → E → F → G
--   (G is optional and requires the pg_cron extension.)
-- ============================================================================


-- ============================================================================
-- PHASE A — TABLES                                            [schema.sql:45-828]
-- Creates the four missing tables (+ shared trigger fn + subscription trigger).
-- Dependency: none beyond auth.users (Supabase-managed).
-- ============================================================================

-- shared trigger fn — already present since rev-1; CREATE OR REPLACE = safe no-op
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- A1 clinics
CREATE TABLE IF NOT EXISTS clinics (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  owner_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

-- A2 clinic_members
CREATE TABLE IF NOT EXISTS clinic_members (
  clinic_id  uuid NOT NULL REFERENCES clinics(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id)
);
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;

-- A3 clinic_subscriptions (base columns; Stripe columns added in Phase B)
CREATE TABLE IF NOT EXISTS clinic_subscriptions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid        NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  status                 text,
  plan_id                text,
  external_billing_id    text        UNIQUE,
  trial_ends_at          timestamptz,
  current_period_ends_at timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clinic_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE TRIGGER clinic_subscriptions_updated_at
    BEFORE UPDATE ON clinic_subscriptions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A4 workflow_observations
CREATE TABLE IF NOT EXISTS workflow_observations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text        NOT NULL,
  event_type  text        NOT NULL,
  flags       jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workflow_observations ENABLE ROW LEVEL SECURITY;

-- ── CHECKPOINT A ── expect 4 rows: clinic_members, clinic_subscriptions, clinics, workflow_observations
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('clinics','clinic_members','clinic_subscriptions','workflow_observations')
ORDER BY tablename;


-- ============================================================================
-- PHASE B — COLUMNS (additive)                               [schema.sql:378-906]
-- patients.clinic_id (+FK) and clinic_subscriptions Stripe columns.
-- Dependency: Phase A (clinics must exist for the FK).
-- ============================================================================

-- B1 patients.clinic_id + FK (existing rows get NULL — no backfill, FK satisfied)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id uuid;
DO $$ BEGIN
  ALTER TABLE patients ADD CONSTRAINT patients_clinic_fk
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- B2 clinic_subscriptions Stripe columns
ALTER TABLE clinic_subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
DO $$ BEGIN
  ALTER TABLE clinic_subscriptions ADD CONSTRAINT clinic_subscriptions_stripe_customer_unique
    UNIQUE (stripe_customer_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE clinic_subscriptions ADD COLUMN IF NOT EXISTS stripe_event_at timestamptz;

-- ── CHECKPOINT B ── expect 3 rows: clinic_id, stripe_customer_id, stripe_event_at
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND (
  (table_name='patients'             AND column_name='clinic_id') OR
  (table_name='clinic_subscriptions' AND column_name IN ('stripe_customer_id','stripe_event_at')))
ORDER BY column_name;


-- ============================================================================
-- PHASE C — INDEXES                                  [schema.sql:345-356,399,913]
-- Dependency: Phases A/B (tables + columns).
-- ============================================================================
CREATE INDEX IF NOT EXISTS clinics_owner_idx              ON clinics (owner_user_id);
CREATE INDEX IF NOT EXISTS clinic_members_user_idx        ON clinic_members (user_id);
CREATE INDEX IF NOT EXISTS clinic_members_user_clinic_idx ON clinic_members (user_id, clinic_id);
CREATE INDEX IF NOT EXISTS patients_clinic_idx            ON patients (clinic_id) WHERE clinic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clinic_subscriptions_customer_idx
  ON clinic_subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ── CHECKPOINT C ── expect 5 rows
SELECT indexname FROM pg_indexes WHERE schemaname='public'
  AND indexname IN ('clinics_owner_idx','clinic_members_user_idx','clinic_members_user_clinic_idx',
                    'patients_clinic_idx','clinic_subscriptions_customer_idx')
ORDER BY indexname;


-- ============================================================================
-- PHASE D — GRANTS  (bug-167 remediation; NOT in schema.sql)
-- Principle: grant = RLS policy surface. GRANT is orthogonal to RLS — authenticated
-- is NOT BYPASSRLS, so every privilege below stays row-confined by Phase E.
-- Dependency: Phase A (tables must exist before GRANT). Run as a grant-capable
-- role (postgres in the SQL Editor). Naturally idempotent (re-GRANT = no-op).
-- ============================================================================

-- D0 schema usage (grants no table access by itself)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- D1 authenticated — table DML matched 1:1 to the Phase E policy surface
GRANT SELECT, INSERT, UPDATE, DELETE ON patients              TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON profiles              TO authenticated;  -- no DELETE: no policy (cascade via auth.users)
GRANT SELECT, INSERT, UPDATE, DELETE ON clinics               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_members        TO authenticated;
GRANT SELECT                         ON clinic_subscriptions  TO authenticated;  -- SELECT-only: Phase 12 made billing writes server-side
GRANT INSERT                         ON workflow_observations TO authenticated;  -- write-only friction log

-- D2 service_role — server-side billing/trial writes (BYPASSRLS skips RLS, NOT the ACL check)
GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_subscriptions  TO service_role;

-- D3 recurrence prevention (recommended) — future tables inherit grants.
-- Scoped to the table-creating role (postgres). RLS remains the per-row gate.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- ── CHECKPOINT D ── expect all columns = true
SELECT has_schema_privilege('authenticated','public','USAGE')                        AS auth_schema_usage,
       has_table_privilege ('authenticated','public.clinics','INSERT')               AS auth_clinics_insert,
       has_table_privilege ('authenticated','public.clinic_members','INSERT')        AS auth_members_insert,
       has_table_privilege ('authenticated','public.clinic_subscriptions','SELECT')  AS auth_sub_select,
       has_table_privilege ('authenticated','public.patients','SELECT')              AS auth_patients_select,
       has_table_privilege ('service_role','public.clinic_subscriptions','INSERT')   AS svc_sub_insert;


-- ============================================================================
-- PHASE E — RLS POLICIES                            [schema.sql:446-838,1006-1018]
-- Dependency: Phase A (referenced tables must exist; bodies bind at query time).
-- NOTE: clinic_subscriptions net rev-7 = 2 SELECT policies. schema.sql created 3
-- write policies (727-771) then DROPped them (923-925); honoring no-DROP, they are
-- simply never created here (table is freshly created in Phase A).
-- ============================================================================

-- clinics (4)
DO $$ BEGIN CREATE POLICY "clinics_select_member" ON clinics FOR SELECT
  USING (auth.uid() = owner_user_id OR EXISTS (
    SELECT 1 FROM clinic_members WHERE clinic_members.clinic_id = clinics.id
      AND clinic_members.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinics_insert_owner" ON clinics FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinics_update_owner" ON clinics FOR UPDATE
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinics_delete_owner" ON clinics FOR DELETE
  USING (auth.uid() = owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- clinic_members (5)
DO $$ BEGIN CREATE POLICY "clinic_members_select_self" ON clinic_members FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinic_members_insert_owner" ON clinic_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clinics WHERE clinics.id = clinic_id AND clinics.owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinic_members_update_owner" ON clinic_members FOR UPDATE
  USING      (EXISTS (SELECT 1 FROM clinics WHERE clinics.id = clinic_id AND clinics.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clinics WHERE clinics.id = clinic_id AND clinics.owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinic_members_delete_owner_or_self" ON clinic_members FOR DELETE
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM clinics WHERE clinics.id = clinic_id AND clinics.owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinic_members_select_owner_roster" ON clinic_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM clinics WHERE clinics.id = clinic_id AND clinics.owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- patients — clinic-member SELECT extension (1)
DO $$ BEGIN CREATE POLICY "patients_select_clinic_member" ON patients FOR SELECT
  USING (clinic_id IS NOT NULL AND EXISTS (SELECT 1 FROM clinic_members
    WHERE clinic_members.clinic_id = patients.clinic_id AND clinic_members.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- clinic_subscriptions (2 net SELECT policies)
DO $$ BEGIN CREATE POLICY "clinic_subscriptions_select_owner" ON clinic_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM clinics WHERE clinics.id = clinic_id AND clinics.owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "clinic_subscriptions_select_member" ON clinic_subscriptions FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM clinic_members
    WHERE clinic_members.clinic_id = clinic_subscriptions.clinic_id AND clinic_members.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- workflow_observations (1)
DO $$ BEGIN CREATE POLICY "observations_insert_authenticated" ON workflow_observations FOR INSERT
  TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CHECKPOINT E ── expect: clinic_members=5, clinic_subscriptions=2, clinics=4, workflow_observations=1
SELECT tablename, count(*) AS policy_count FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('clinics','clinic_members','clinic_subscriptions','workflow_observations')
GROUP BY tablename ORDER BY tablename;


-- ============================================================================
-- PHASE F — FUNCTIONS                                       [schema.sql:943-1144]
-- Dependency: Phase A/B (clinic_subscriptions + UNIQUE(clinic_id)).
-- All three are service-role-invoked (not callable usefully by authenticated).
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_clinic_subscription(
  p_clinic_id uuid, p_stripe_customer_id text, p_external_billing_id text,
  p_status text, p_plan_id text, p_trial_ends_at timestamptz,
  p_current_period_ends_at timestamptz, p_stripe_event_at timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO clinic_subscriptions (clinic_id, stripe_customer_id, external_billing_id,
    status, plan_id, trial_ends_at, current_period_ends_at, stripe_event_at)
  VALUES (p_clinic_id, p_stripe_customer_id, p_external_billing_id,
    p_status, p_plan_id, p_trial_ends_at, p_current_period_ends_at, p_stripe_event_at)
  ON CONFLICT (clinic_id) DO UPDATE SET
    stripe_customer_id=EXCLUDED.stripe_customer_id, external_billing_id=EXCLUDED.external_billing_id,
    status=EXCLUDED.status, plan_id=EXCLUDED.plan_id, trial_ends_at=EXCLUDED.trial_ends_at,
    current_period_ends_at=EXCLUDED.current_period_ends_at, stripe_event_at=EXCLUDED.stripe_event_at
  WHERE (clinic_subscriptions.stripe_event_at IS NULL
      OR clinic_subscriptions.stripe_event_at < EXCLUDED.stripe_event_at);
END; $$;

CREATE OR REPLACE FUNCTION start_clinic_trial(p_clinic_id uuid, p_trial_days integer DEFAULT 14)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO clinic_subscriptions (clinic_id, status, trial_ends_at, created_at, updated_at)
  VALUES (p_clinic_id, 'trialing', now() + (p_trial_days || ' days')::interval, now(), now())
  ON CONFLICT (clinic_id) DO UPDATE SET
    status='trialing', trial_ends_at = now() + (p_trial_days || ' days')::interval, updated_at = now()
  WHERE clinic_subscriptions.status IS NULL
     OR clinic_subscriptions.status NOT IN ('active','trialing');
END; $$;

CREATE OR REPLACE FUNCTION expire_trialing_subscriptions()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE expired_count integer;
BEGIN
  UPDATE clinic_subscriptions SET status='canceled', updated_at=now()
  WHERE status='trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END; $$;

-- ── CHECKPOINT F ── expect 3 rows
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN
  ('upsert_clinic_subscription','start_clinic_trial','expire_trialing_subscriptions')
ORDER BY proname;


-- ============================================================================
-- PHASE G — pg_cron  (OPTIONAL — requires pg_cron extension)  [schema.sql:1159]
-- Prerequisite: Dashboard → Database → Extensions → enable pg_cron.
-- If pg_cron is unavailable on this project tier, SKIP this phase entirely;
-- A–F remain fully valid (trials simply will not auto-expire).
-- Dependency: Phase F (expire_trialing_subscriptions()).
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='expire-trialing-subscriptions') THEN
    PERFORM cron.unschedule('expire-trialing-subscriptions');
  END IF;
  PERFORM cron.schedule('expire-trialing-subscriptions','0 2 * * *',
    'SELECT expire_trialing_subscriptions()');
END $$;

-- ── CHECKPOINT G ── expect 1 row: expire-trialing-subscriptions | 0 2 * * *
SELECT jobname, schedule FROM cron.job WHERE jobname='expire-trialing-subscriptions';

-- ============================================================================
-- END OF RECOVERY PACKAGE — run docs/recovery/bug-167-verification.sql for the
-- complete read-only post-execution validation suite.
-- ============================================================================
