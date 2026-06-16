-- ============================================================================
-- DENAI — bug-167 RECOVERY VERIFICATION SUITE
-- READ-ONLY. No INSERT/UPDATE/DELETE/DDL. Safe to run any number of times.
-- Run AFTER bug-167-recovery.sql. Each section states its expected result.
-- ============================================================================


-- §1 TABLES ------------------------------------------------------------------
-- Expect present = true for all four recovered tables (+ existing base tables).
SELECT name,
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=name) AS present
FROM (VALUES ('clinics'),('clinic_members'),('clinic_subscriptions'),
             ('workflow_observations'),('patients'),('profiles')) t(name)
ORDER BY name;


-- §2 COLUMNS -----------------------------------------------------------------
-- Expect 3 rows: patients.clinic_id, clinic_subscriptions.stripe_customer_id,
--                clinic_subscriptions.stripe_event_at.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND (
  (table_name='patients'             AND column_name='clinic_id') OR
  (table_name='clinic_subscriptions' AND column_name IN ('stripe_customer_id','stripe_event_at')))
ORDER BY table_name, column_name;

-- FK presence: expect 1 row (patients_clinic_fk → clinics).
SELECT conname AS constraint_name
FROM pg_constraint
WHERE conname='patients_clinic_fk' AND conrelid='public.patients'::regclass;


-- §3 INDEXES -----------------------------------------------------------------
-- Expect 5 rows.
SELECT indexname
FROM pg_indexes
WHERE schemaname='public' AND indexname IN (
  'clinics_owner_idx','clinic_members_user_idx','clinic_members_user_clinic_idx',
  'patients_clinic_idx','clinic_subscriptions_customer_idx')
ORDER BY indexname;


-- §4 POLICIES ----------------------------------------------------------------
-- Expect: clinics=4, clinic_members=5, clinic_subscriptions=2,
--         workflow_observations=1, patients>=5 (4 personal + clinic-member SELECT),
--         profiles=3.
SELECT tablename, count(*) AS policy_count
FROM pg_policies
WHERE schemaname='public' AND tablename IN (
  'clinics','clinic_members','clinic_subscriptions','workflow_observations',
  'patients','profiles')
GROUP BY tablename ORDER BY tablename;

-- Confirm RLS is ENABLED on every recovered table (expect relrowsecurity = true).
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace='public'::regnamespace AND relname IN (
  'clinics','clinic_members','clinic_subscriptions','workflow_observations')
ORDER BY relname;


-- §5 FUNCTIONS ---------------------------------------------------------------
-- Expect 3 rows with their argument signatures.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'upsert_clinic_subscription','start_clinic_trial','expire_trialing_subscriptions')
ORDER BY p.proname;


-- §6 GRANTS / PRIVILEGES (authoritative — independent of enabled-role filters) -
-- Schema usage: expect true for anon, authenticated, service_role.
SELECT r AS role, has_schema_privilege(r,'public','USAGE') AS usage
FROM (VALUES ('anon'),('authenticated'),('service_role')) x(r) ORDER BY r;

-- authenticated table privileges — expect the grant=policy-surface matrix:
--   patients              t t t t
--   profiles              t t t f   (no DELETE)
--   clinics               t t t t
--   clinic_members        t t t t
--   clinic_subscriptions  t f f f   (SELECT only)
--   workflow_observations f t f f   (INSERT only)
SELECT t AS table_name,
       has_table_privilege('authenticated','public.'||t,'SELECT') AS sel,
       has_table_privilege('authenticated','public.'||t,'INSERT') AS ins,
       has_table_privilege('authenticated','public.'||t,'UPDATE') AS upd,
       has_table_privilege('authenticated','public.'||t,'DELETE') AS del
FROM (VALUES ('patients'),('profiles'),('clinics'),('clinic_members'),
             ('clinic_subscriptions'),('workflow_observations')) x(t)
ORDER BY t;

-- anon must have NO table DML on these tables — expect all false (fail-closed).
SELECT t AS table_name,
       has_table_privilege('anon','public.'||t,'SELECT') AS sel,
       has_table_privilege('anon','public.'||t,'INSERT') AS ins
FROM (VALUES ('patients'),('profiles'),('clinics'),('clinic_members'),
             ('clinic_subscriptions')) x(t)
ORDER BY t;

-- service_role billing writes — expect true.
SELECT has_table_privilege('service_role','public.clinic_subscriptions','INSERT') AS svc_ins,
       has_table_privilege('service_role','public.clinic_subscriptions','UPDATE') AS svc_upd;

-- Raw ACL cross-check for clinics (decode: r=SELECT a=INSERT w=UPDATE d=DELETE).
SELECT c.relname, g.grantee::regrole AS role, g.privilege_type
FROM pg_class c, aclexplode(c.relacl) g
WHERE c.relnamespace='public'::regnamespace AND c.relname='clinics'
ORDER BY 2,3;


-- §7 CLINIC CREATION PATH (read-only readiness — NO write performed) ----------
-- createClinic() does: authenticated INSERT clinics + SELECT id, then INSERT
-- clinic_members. Readiness = grant present AND insert policy present.
SELECT
  has_table_privilege('authenticated','public.clinics','INSERT')        AS can_insert_clinics,
  has_table_privilege('authenticated','public.clinics','SELECT')        AS can_read_back_clinics,
  has_table_privilege('authenticated','public.clinic_members','INSERT') AS can_insert_members,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinics' AND policyname='clinics_insert_owner')         AS clinics_insert_policy,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinic_members' AND policyname='clinic_members_insert_owner') AS members_insert_policy;
-- Expect all true.


-- §8 CLINIC MEMBERSHIP PATH (read-only readiness) -----------------------------
-- _load(): authenticated SELECT clinic_members JOIN clinics(name).
SELECT
  has_table_privilege('authenticated','public.clinic_members','SELECT') AS can_read_members,
  has_table_privilege('authenticated','public.clinics','SELECT')        AS can_read_clinics,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinic_members' AND policyname='clinic_members_select_self')        AS member_self_policy,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinic_members' AND policyname='clinic_members_select_owner_roster') AS member_roster_policy,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinics' AND policyname='clinics_select_member')                     AS clinics_select_policy;
-- Expect all true.


-- §9 SUBSCRIPTION / ENTITLEMENT PATH (read-only readiness) --------------------
-- _loadSubscription(): authenticated SELECT clinic_subscriptions (NO client write).
SELECT
  has_table_privilege('authenticated','public.clinic_subscriptions','SELECT') AS can_read_sub,
  has_table_privilege('authenticated','public.clinic_subscriptions','INSERT') AS client_cannot_write_sub_should_be_false,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinic_subscriptions' AND policyname='clinic_subscriptions_select_owner')  AS sub_select_owner_policy,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename='clinic_subscriptions' AND policyname='clinic_subscriptions_select_member') AS sub_select_member_policy;
-- Expect: can_read_sub=true, client_cannot_write_sub_should_be_false=FALSE, both policies=true.


-- §10 pg_cron (only meaningful if Phase G was applied) ------------------------
-- Expect 1 row if pg_cron is enabled and Phase G ran; 0 rows if Phase G skipped.
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname='expire-trialing-subscriptions';

-- ============================================================================
-- END VERIFICATION SUITE
-- ============================================================================
