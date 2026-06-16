-- ============================================================================
-- DENAI — bug-167-phase-e-fix — RLS Recursion Resolution
-- Target project : dwwtbumwojzohclzxson
-- Prerequisite   : bug-167-recovery.sql Phases A–F applied and verified.
-- Problem        : clinics_select_member ↔ clinic_members_select_owner_roster
--                  mutual RLS recursion → 42P17 infinite recursion detected.
-- Fix            : Two SECURITY DEFINER helper functions break the recursion.
--                  Two policies rewritten to use functions instead of recursive
--                  cross-table EXISTS subqueries. All other policies unchanged.
-- Safety         : Functions are additive (CREATE OR REPLACE). Policies use
--                  ALTER (no DROP, no gap). No data touched. No table changes.
--                  No auth changes. Fully idempotent.
-- ============================================================================
-- MANDATORY ORDER: Step 1 → Step 2 → Step 3 → Step 4 → Checkpoint
-- ============================================================================


-- ============================================================================
-- STEP 1 — SECURITY DEFINER HELPER FUNCTIONS
--
-- Why SECURITY DEFINER: allows the function to query its target table as
--   postgres (owner), bypassing RLS. This prevents the RLS evaluation of
--   clinic_members from re-entering clinics RLS and vice versa.
--
-- Why SET search_path = '': prevents schema injection. A SECURITY DEFINER
--   function running as postgres that resolves table names via the caller's
--   search_path is exploitable. Empty path forces full qualification.
--
-- Why LANGUAGE sql / STABLE: single SELECT expression, read-only, result is
--   consistent for the same input within a statement. Allows planner caching
--   (important for RLS per-row calls on the same clinic_id).
--
-- auth.uid(): already schema-qualified (auth.uid). Resolves correctly with
--   empty search_path. Reads request.jwt.claims session variable — persists
--   through SECURITY DEFINER role context switch (documented Supabase behavior).
--
-- CREATE OR REPLACE: idempotent — safe to re-run without effect.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_clinic_owner(p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = p_clinic_id
      AND owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_member(p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_id  = p_clinic_id
      AND user_id    = auth.uid()
  );
$$;


-- ============================================================================
-- STEP 2 — EXECUTE PRIVILEGE LOCKDOWN
--
-- Postgres default: GRANT EXECUTE TO PUBLIC for any new function.
-- PUBLIC includes anon — unnecessary and exposes functions as RPC endpoints.
-- anon has no table-level SELECT on clinics / clinic_members (Phase D grants
--   authenticated only). 42501 fires before RLS, so anon never reaches the
--   function call path. anon EXECUTE is not required and must not be granted.
--
-- REVOKE → GRANT is idempotent: re-running produces no change.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.is_clinic_owner(uuid)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_clinic_member(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_clinic_owner(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_clinic_member(uuid) TO authenticated, service_role;


-- ============================================================================
-- STEP 3 — REWRITE clinics_select_member
--
-- Original USING (recursive):
--   auth.uid() = owner_user_id
--   OR EXISTS (SELECT 1 FROM clinic_members
--              WHERE clinic_members.clinic_id = clinics.id
--                AND clinic_members.user_id   = auth.uid())
--
-- Fixed USING (non-recursive):
--   auth.uid() = owner_user_id OR public.is_clinic_member(id)
--
-- Semantics: identical. is_clinic_member queries public.clinic_members as
--   postgres (no RLS on clinic_members during the lookup), returning a boolean.
--   The cross-table RLS re-entry is eliminated.
--
-- The owner short-circuit (auth.uid() = owner_user_id) is preserved as the
--   first OR branch. This is critical: clinic_members_insert_owner's WITH CHECK
--   queries clinics at the moment the owner's membership row does not yet exist
--   (Step 2 of createClinic). The short-circuit allows the clinic to be visible
--   to the owner without requiring is_clinic_member to return true.
--
-- ALTER POLICY: modifies the USING expression in-place. No policy gap.
--   Falls back to CREATE if the policy does not exist (recovery not yet run).
-- ============================================================================

DO $$ BEGIN
  ALTER POLICY "clinics_select_member" ON public.clinics
    USING (auth.uid() = owner_user_id OR public.is_clinic_member(id));
EXCEPTION WHEN undefined_object THEN
  CREATE POLICY "clinics_select_member" ON public.clinics FOR SELECT
    USING (auth.uid() = owner_user_id OR public.is_clinic_member(id));
END $$;


-- ============================================================================
-- STEP 4 — REWRITE clinic_members_select_owner_roster
--
-- Original USING (recursive):
--   EXISTS (SELECT 1 FROM clinics
--           WHERE clinics.id = clinic_id
--             AND clinics.owner_user_id = auth.uid())
--
-- Fixed USING (non-recursive):
--   public.is_clinic_owner(clinic_id)
--
-- Semantics: identical. is_clinic_owner queries public.clinics as postgres
--   (no RLS on clinics during the lookup). The return path of the recursion
--   loop is eliminated.
-- ============================================================================

DO $$ BEGIN
  ALTER POLICY "clinic_members_select_owner_roster" ON public.clinic_members
    USING (public.is_clinic_owner(clinic_id));
EXCEPTION WHEN undefined_object THEN
  CREATE POLICY "clinic_members_select_owner_roster" ON public.clinic_members FOR SELECT
    USING (public.is_clinic_owner(clinic_id));
END $$;


-- ============================================================================
-- VERIFICATION SUITE — RLS Recursion Fix
-- Read-only. Safe to run any number of times. Run after Steps 1–4.
-- ============================================================================

-- V1: Functions exist, are SECURITY DEFINER, and have search_path locked.
-- Expect: 2 rows, security_definer=true, config contains 'search_path='
SELECT p.proname                     AS function_name,
       p.prosecdef                   AS security_definer,
       p.proconfig                   AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_clinic_owner','is_clinic_member')
ORDER BY p.proname;


-- V2: EXECUTE grants — expect only authenticated + service_role per function.
-- Expect: 4 rows total. public/anon must NOT appear.
SELECT p.proname AS function_name,
       a.grantee::regrole::text AS grantee,
       a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
aclexplode(p.proacl) a
WHERE n.nspname = 'public'
  AND p.proname IN ('is_clinic_owner','is_clinic_member')
ORDER BY p.proname, a.grantee::regrole::text;


-- V3: Policy bodies updated — confirm USING expressions.
-- clinics_select_member      : expect uid() = owner_user_id OR is_clinic_member(id)
-- clinic_members_select_owner_roster : expect is_clinic_owner(clinic_id)
SELECT c.relname                                      AS table_name,
       pol.polname                                    AS policy_name,
       pg_get_expr(pol.polqual, pol.polrelid)         AS using_expr
FROM pg_policy pol
JOIN pg_class c     ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND pol.polname IN ('clinics_select_member','clinic_members_select_owner_roster')
ORDER BY c.relname, pol.polname;


-- V4: Functional smoke test — both functions execute without error.
-- Expect: should_be_false=false, should_be_false_2=false
-- (postgres role has no JWT claims → auth.uid() = NULL → no match)
SELECT public.is_clinic_owner(gen_random_uuid())  AS should_be_false,
       public.is_clinic_member(gen_random_uuid()) AS should_be_false_2;


-- ============================================================================
-- ROLLBACK SECTION — bug-167-phase-e-fix
-- WARNING: Reverting returns the database to the 42P17 recursion state.
-- Execute only if the fix caused an unexpected regression. After rollback,
-- clinic creation and session load will again fail with infinite recursion.
-- ============================================================================

-- R1: Restore clinics_select_member to original (recursive) USING expression.
DO $$ BEGIN
  ALTER POLICY "clinics_select_member" ON public.clinics
    USING (auth.uid() = owner_user_id OR EXISTS (
      SELECT 1 FROM clinic_members
      WHERE clinic_members.clinic_id = clinics.id
        AND clinic_members.user_id   = auth.uid()));
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- R2: Restore clinic_members_select_owner_roster to original (recursive) USING.
DO $$ BEGIN
  ALTER POLICY "clinic_members_select_owner_roster" ON public.clinic_members
    USING (EXISTS (
      SELECT 1 FROM clinics
      WHERE clinics.id            = clinic_id
        AND clinics.owner_user_id = auth.uid()));
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- R3: Remove helper functions (they are new — did not exist before this fix).
DROP FUNCTION IF EXISTS public.is_clinic_owner(uuid);
DROP FUNCTION IF EXISTS public.is_clinic_member(uuid);


-- ============================================================================
-- EXECUTION NOTES
-- ============================================================================
--
-- Execution order:
--   Step 1 (functions) MUST run before Steps 3/4 — Postgres resolves function
--   references in ALTER POLICY USING expressions at parse time, not at query
--   time. If the functions do not exist yet, the ALTER POLICY statements in
--   Steps 3/4 will fail with "function public.is_clinic_owner(uuid) does not
--   exist" or equivalent.
--
--   Step 2 (grants) should run immediately after Step 1, before Steps 3/4,
--   though it has no hard ordering dependency on them.
--
--   Steps 3 and 4 are independent of each other and may run in either order.
--
-- Idempotency:
--   All four steps are safe to re-run. CREATE OR REPLACE FUNCTION, REVOKE/
--   GRANT, and ALTER POLICY (with CREATE POLICY fallback on undefined_object)
--   each produce no error and no unintended change on repeated execution.
--
-- Prerequisite:
--   bug-167-recovery.sql Phases A–F must already be applied. This fix assumes
--   clinics, clinic_members, clinic_subscriptions, and workflow_observations
--   exist, and that the original Phase E policy set (as shipped in
--   bug-167-recovery.sql) is in place prior to Steps 3/4 running.
--
-- Scope confirmation:
--   Only two policies are rewritten: clinics_select_member and
--   clinic_members_select_owner_roster. All other Phase E policies
--   (clinics_insert_owner, clinics_update_owner, clinics_delete_owner,
--   clinic_members_select_self, clinic_members_insert_owner,
--   clinic_members_update_owner, clinic_members_delete_owner_or_self,
--   patients_select_clinic_member, clinic_subscriptions_select_owner,
--   clinic_subscriptions_select_member, observations_insert_authenticated)
--   are unchanged. Their cross-table EXISTS subqueries on clinics or
--   clinic_members route through the two fixed policies above and are
--   safe as a result — no recursion remains anywhere in the policy set.
--
-- Post-execution validation (functional, requires a signed-in user):
--   1. Sign in → Account → create a clinic → expect success, no 42P17.
--   2. Reload the app → clinic name persists.
--   3. Owner view shows the full member roster (not just their own row).
--   4. Non-owner member can read their clinic's name and subscription status.
-- ============================================================================
