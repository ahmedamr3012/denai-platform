-- ============================================================
-- denai — Cloud Schema v1
-- Wave 7C design artifact. DO NOT execute directly.
-- Apply via Supabase Studio (SQL Editor) or `supabase db push`.
-- ============================================================
--
-- ARCHITECTURE CONTRACT:
-- • auth.users is managed by Supabase Auth — never touch it.
-- • All denai tables use auth.uid() as the ownership anchor.
-- • RLS is enabled on every table — default-deny.
-- • `notes` is NOT stored here until Wave 7G (encrypted notes).
-- • `activeSite` is NOT stored here — it is device-local navigation state.
-- • AI outputs are NOT stored here — they are computed deterministically.
--
-- SCHEMA FILE REVISION: 6  (Phase 13: Feature Gating)
--   Revision 5: Phase 12 — Stripe Infrastructure (+stripe_customer_id, +stripe_event_at, upsert RPC)
--   Revision 4: Phase 8 — workflow_observations table added
--   Revision 3: Phase 7 — clinic_subscriptions table added
--   Revision 2: Phase 3.2 — clinic_id column added to patients
-- ROW-LEVEL schema_ver: still 1 — all Phase 3–8 additions are either new tables
-- or nullable additive columns requiring no data transformation on existing rows.
-- See MIGRATION NOTES below for when to bump schema_ver.
-- ============================================================


-- ============================================================
-- TABLE: profiles
-- One row per authenticated user. Created on first sign-in.
-- Stores user-level preferences (dark mode, default cost inputs).
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- JSON blob: { darkMode: boolean, defaultCosts: { costImplant, costBridge, ... } }
  -- Never store PHI here.
  preferences jsonb       NOT NULL DEFAULT '{}'
);

-- Auto-update updated_at on any row change.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- TABLE: patients
-- One row per patient record. Each row is owned by one user.
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (

  -- ── Identity ──────────────────────────────────────────────
  -- Client-generated. Format: 'p_<Date.now()>_<5-char random>'.
  -- Stable across localStorage ↔ cloud migration.
  id          text        PRIMARY KEY,

  -- Ownership anchor for RLS. Cascade-delete orphaned rows on account deletion.
  user_id     uuid        NOT NULL
                          REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── Display columns (also present in state JSONB for single-fetch load) ──
  -- Typed for list queries — avoids JSONB extraction on every list request.
  case_num    text        NOT NULL DEFAULT '',   -- '#4587', '#4588', …
  name        text        NOT NULL DEFAULT '',   -- patient display name

  -- ── Timestamps ────────────────────────────────────────────
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- NULL = active. Non-null = soft-deleted.
  -- Soft delete is required: a hard delete on device A must propagate to
  -- device B on next sync without the row disappearing from conflict detection.
  -- Hard-purge only after deleted_at + 90 days (future scheduled job).
  deleted_at  timestamptz,

  -- ── Clinical payload (JSONB) ──────────────────────────────
  -- Contains all DEFAULT_STATE fields EXCEPT:
  --   notes     → local-only until Wave 7G (see notes_enc below)
  --   activeSite → device-local navigation state, never persisted
  --
  -- Full field list synced into state:
  --   name, age, gender, tooth, condition, bone, hygiene, occlusion, tx,
  --   smoking, diabetes, remainingStructure, endodonticStatus, parafunction,
  --   multiTooth, tooth2, abutmentQuality,
  --   multiSite, site2Tooth, site2Condition, site2Structure, site2EndoStatus,
  --   costImplant, costBridge, costBoneGraft, costCrown, costRCT, costPostCore,
  --   id, caseNum   (redundant with typed columns, included for single-fetch convenience)
  state       jsonb       NOT NULL DEFAULT '{}',

  -- ── Case history (JSONB array) ────────────────────────────
  -- Shape: [{ time: ISO8601, action: string, details: string }, ...]
  -- Capped at 50 entries (matches localStorage limit — app enforces this).
  -- Separate from state to avoid polluting clinical payload.
  history     jsonb       NOT NULL DEFAULT '[]',

  -- ── Encrypted notes (Wave 7G+) ────────────────────────────
  -- NULL until client-side encryption is implemented.
  -- Will hold AES-GCM ciphertext (base64-encoded).
  -- Do NOT populate until Wave 7G is deployed.
  notes_enc   text,

  -- ── Clinic ownership (Phase 3.2) ─────────────────────────────────────────
  -- NULL = no clinic (personal workspace, pre-3.2 patients, local-only users).
  -- FK defined in Phase 3.2 migration section below — clinics is declared
  -- later in this file, so inline REFERENCES would fail fresh-install ordering.
  -- Populated by future clinic-assignment flow (Phase 3.3+).
  clinic_id   uuid,

  -- ── Migration tracking ────────────────────────────────────
  -- Incremented when a schema-breaking change requires data transformation.
  -- Version 1 = Wave 7C schema.
  -- Version 2 = Phase 3.2: clinic_id typed column added.
  schema_ver  smallint    NOT NULL DEFAULT 1

);

-- Auto-update updated_at
DO $$ BEGIN
  CREATE TRIGGER patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- INDEXES
-- ============================================================

-- Primary list query: all active patients for a user, newest first.
-- This is the only frequent query pattern in Wave 7D/7E.
CREATE INDEX IF NOT EXISTS patients_user_active_idx
  ON patients (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Sync query: patients updated after a given timestamp (incremental sync).
-- Used by the sync queue flush to detect server-side changes.
CREATE INDEX IF NOT EXISTS patients_user_updated_idx
  ON patients (user_id, updated_at)
  WHERE deleted_at IS NULL;

-- Soft-delete reconciliation: locate deleted rows for a user.
CREATE INDEX IF NOT EXISTS patients_user_deleted_idx
  ON patients (user_id, deleted_at)
  WHERE deleted_at IS NOT NULL;


-- ============================================================
-- ROW LEVEL SECURITY — profiles
-- Default-deny. Users access only their own row.
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No delete policy intentionally — profiles are cascade-deleted via auth.users.


-- ============================================================
-- ROW LEVEL SECURITY — patients
-- Default-deny. Users access only rows where user_id = their uid.
-- ============================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_select_own"
  ON patients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "patients_insert_own"
  ON patients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "patients_update_own"
  ON patients FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "patients_delete_own"
  ON patients FOR DELETE
  USING (auth.uid() = user_id);

-- NOTE: The DELETE policy is for explicit hard-deletes (e.g., admin purge).
-- The application uses soft-delete (SET deleted_at = now()) for all
-- user-initiated deletes. The UPDATE policy covers soft-delete.


-- ============================================================
-- UPSERT HELPER (reference for Wave 7D sync implementation)
-- ============================================================
-- The sync queue uses INSERT ... ON CONFLICT (id) DO UPDATE.
-- This pattern is idempotent: re-sending the same payload is a no-op
-- if updated_at on the server is >= the incoming updated_at.
--
-- Example (for reference — not a migration):
--
--   INSERT INTO patients (id, user_id, case_num, name, state, history, updated_at)
--   VALUES ($1, auth.uid(), $2, $3, $4, $5, $6)
--   ON CONFLICT (id)
--   DO UPDATE SET
--     name       = EXCLUDED.name,
--     case_num   = EXCLUDED.case_num,
--     state      = EXCLUDED.state,
--     history    = EXCLUDED.history,
--     updated_at = EXCLUDED.updated_at,
--     deleted_at = EXCLUDED.deleted_at
--   WHERE patients.updated_at < EXCLUDED.updated_at;  -- last-write-wins
--
-- The WHERE clause prevents overwriting a newer server record with a stale
-- client record (handles multi-device conflict automatically).


-- ============================================================
-- MIGRATION NOTES
-- ============================================================
--
-- Adding a new field to DEFAULT_STATE:
--   1. No SQL migration required for the JSONB column.
--   2. The JS spread `{ ...DEFAULT_STATE, ...stateFromCloud }` fills in defaults.
--   3. Increment schema_ver in schema.sql comments and update DEFAULT_SCHEMA_VER
--      constant (to be defined in Wave 7D sync module).
--
-- Adding a new TYPED column:
--   1. Always use `ADD COLUMN x type DEFAULT value` — never NOT NULL without DEFAULT.
--   2. Backfill existing rows if needed.
--   3. Increment schema_ver.
--
-- Removing a field from DEFAULT_STATE:
--   1. The JSONB may still contain the old field — this is harmless.
--   2. Application code ignores unknown JSONB fields on load.
--   3. Clean up with: UPDATE patients SET state = state - 'old_field' WHERE schema_ver < N
--   4. Only after all clients have been updated.
--
-- Renaming a field:
--   1. Add new field, backfill from old field, remove old field in three separate waves.
--   2. Never rename a JSONB key in-place — localStorage sync would break for offline users.


-- ============================================================
-- Phase 3.1 — Clinic Schema Foundation
-- ============================================================
--
-- PURPOSE: Establishes the minimal ownership boundary for future clinic isolation.
-- This is schema preparation only. The following are intentionally deferred:
--   - clinic_id column on patients  (Phase 3.2 — propagation)
--   - RLS policies on clinic tables (Phase 3.2 — RLS enforcement)
--   - Membership UX / invitations   (future)
--   - Subscriptions / billing       (future)
--
-- ROLE MODEL: 'owner' | 'member' only.
-- No admin hierarchy, no nested workspaces, no enterprise RBAC.
-- ============================================================


-- ============================================================
-- TABLE: clinics
-- One row per clinic. Ownership anchor for all future isolation.
-- ============================================================

CREATE TABLE IF NOT EXISTS clinics (

  -- Server-generated UUID. Unlike patient IDs (client-generated), clinics are
  -- created server-side via a future onboarding flow.
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  name           text        NOT NULL,

  -- Ownership anchor. RESTRICT (not CASCADE): deleting a user must not silently
  -- destroy a clinic that may have members and patient data. Ownership must be
  -- explicitly transferred or the clinic deleted before account removal.
  owner_user_id  uuid        NOT NULL
                             REFERENCES auth.users(id) ON DELETE RESTRICT,

  created_at     timestamptz NOT NULL DEFAULT now()

);

-- Default-deny. No RLS policies until Phase 3.2.
-- With no policies, authenticated requests return 0 rows (safe empty state).
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLE: clinic_members
-- One row per user-clinic membership.
-- Composite PK enforces one role per user per clinic.
-- ============================================================

CREATE TABLE IF NOT EXISTS clinic_members (

  clinic_id   uuid  NOT NULL
                    REFERENCES clinics(id) ON DELETE CASCADE,

  user_id     uuid  NOT NULL
                    REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 'owner' | 'member' only. Enforced at DB level.
  -- The clinic creator always gets 'owner'. Members invited later get 'member'.
  role        text  NOT NULL
                    CHECK (role IN ('owner', 'member')),

  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (clinic_id, user_id)

);

-- Default-deny. No RLS policies until Phase 3.2.
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- INDEXES — clinic tables
-- ============================================================

-- "Which clinics does this user own?" — used by future onboarding / dashboard.
CREATE INDEX IF NOT EXISTS clinics_owner_idx
  ON clinics (owner_user_id);

-- "Which clinics does this user belong to?" — used by future auth association.
CREATE INDEX IF NOT EXISTS clinic_members_user_idx
  ON clinic_members (user_id);

-- Composite: satisfies patients_select_clinic_member EXISTS subquery
-- (clinic_members.clinic_id = patients.clinic_id AND clinic_members.user_id = auth.uid())
-- in a single index-only lookup instead of a filter pass over user_idx rows.
CREATE INDEX IF NOT EXISTS clinic_members_user_clinic_idx
  ON clinic_members (user_id, clinic_id);


-- ============================================================
-- Phase 3.2 — clinic_id Propagation
-- ============================================================
--
-- PURPOSE: Establishes clinic ownership on operational patient data.
-- This is propagation infrastructure only. The following are deferred:
--   - RLS policy enforcement on patients by clinic  (Phase 3.3)
--   - Clinic-assignment UI / session context         (Phase 3.3)
--   - clinic_id population for existing patients    (Phase 3.3+ onboarding)
--
-- SAFETY PROPERTIES:
--   - clinic_id is NULLABLE: existing patients remain accessible with NULL.
--   - ON DELETE SET NULL: clinic deletion never cascade-deletes patient data.
--   - Additive migration: no backfill required, no existing row touched.
-- ============================================================


-- ── MIGRATION: Add clinic_id column (idempotent — safe on existing databases) ──

ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id uuid;


-- ── MIGRATION: Attach FK constraint ─────────────────────────────────────────
-- ON DELETE SET NULL: patients survive clinic deletion as personal/unaffiliated records.
-- RESTRICT would block clinic deletion; CASCADE would destroy PHI — both are wrong.
-- DO block provides idempotency: re-running after first apply is a safe no-op.

DO $$ BEGIN
  ALTER TABLE patients
    ADD CONSTRAINT patients_clinic_fk
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── INDEX ─────────────────────────────────────────────────────────────────────
-- "All active patients in this clinic" — future RLS and list queries.
-- Partial (WHERE clinic_id IS NOT NULL): unaffiliated patients are excluded,
-- keeping the index lean. NULL rows need no clinic-based routing.

CREATE INDEX IF NOT EXISTS patients_clinic_idx
  ON patients (clinic_id)
  WHERE clinic_id IS NOT NULL;


-- ============================================================
-- Phase 3.3 — RLS Isolation Foundation
-- ============================================================
--
-- PURPOSE: Enforces clinic ownership boundaries at the database policy level.
-- This is the FIRST true isolation enforcement phase — PHI boundary infrastructure.
--
-- ISOLATION MODEL:
--   clinics       — visible to owner + members; writable by owner only.
--   clinic_members — users see their own membership rows; owner manages roster.
--   patients      — existing personal-ownership policies preserved;
--                   clinic members gain SELECT access to clinic-affiliated patients.
--
-- DESIGN PRINCIPLES:
--   - deny-by-default (clinic tables had no policies = 0-row safe baseline)
--   - no circular policy dependencies:
--       clinics_select_member includes a direct owner_user_id = auth.uid() branch
--       so clinic_members write policies can verify ownership without querying
--       back through clinic_members (which would recurse).
--   - NULL clinic_id patients remain personal-only (unaffected by clinic policies)
--   - legacy users with no clinic continue working via existing personal policies
--   - sync compatibility preserved — no change to personal write policies
--   - soft-deleted (tombstone) clinic patients remain visible to clinic members
--     so cross-device tombstone propagation works correctly
--
-- SEQUENCING BOUNDARIES (intentionally NOT in this phase):
--   - clinic-member write access to patients     (Phase 3.4+)
--   - clinic assignment UI / session context     (Phase 3.4+)
--   - roster UX (members seeing other members)   (Phase 3.4+)
--   - audit, support impersonation, admin access (future)
--
-- NOTE: Schema version NOT bumped — RLS policies are behavioral, not structural.
-- ============================================================


-- ── clinics RLS ──────────────────────────────────────────────────────────────

-- SELECT: visible to owner (direct check) and to any current member.
-- The owner_user_id direct branch is intentional: it breaks the bootstrapping
-- circular dependency where clinic_members write policies need to verify
-- ownership by querying clinics, which would otherwise need clinic_members,
-- which needs clinics... The direct owner check terminates the chain.
DO $$ BEGIN
  CREATE POLICY "clinics_select_member"
    ON clinics FOR SELECT
    USING (
      auth.uid() = owner_user_id
      OR EXISTS (
        SELECT 1 FROM clinic_members
        WHERE clinic_members.clinic_id = clinics.id
          AND clinic_members.user_id   = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT: only the owner can create their own clinic.
-- Prevents impersonating another user as the clinic owner.
DO $$ BEGIN
  CREATE POLICY "clinics_insert_owner"
    ON clinics FOR INSERT
    WITH CHECK (auth.uid() = owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- UPDATE: owner only — members cannot rename or modify clinic metadata.
DO $$ BEGIN
  CREATE POLICY "clinics_update_owner"
    ON clinics FOR UPDATE
    USING  (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DELETE: owner only. ON DELETE SET NULL on patients.clinic_id means
-- patient data survives clinic deletion as personal/unaffiliated records.
DO $$ BEGIN
  CREATE POLICY "clinics_delete_owner"
    ON clinics FOR DELETE
    USING (auth.uid() = owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── clinic_members RLS ───────────────────────────────────────────────────────

-- SELECT: users see only their own membership rows.
-- Intentionally minimal — avoids recursive self-join policy risk.
-- Sufficient for: clinic visibility checks, patient access checks, self-removal.
-- Phase 3.4+: add owner roster policy when member management UX is built.
DO $$ BEGIN
  CREATE POLICY "clinic_members_select_self"
    ON clinic_members FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT: clinic owner can add members (foundation for future invitation flow).
-- Reads clinics with the direct owner_user_id branch — no circular dependency.
DO $$ BEGIN
  CREATE POLICY "clinic_members_insert_owner"
    ON clinic_members FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- UPDATE: clinic owner can change member roles.
DO $$ BEGIN
  CREATE POLICY "clinic_members_update_owner"
    ON clinic_members FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DELETE: clinic owner removes members, or a member removes themselves.
DO $$ BEGIN
  CREATE POLICY "clinic_members_delete_owner_or_self"
    ON clinic_members FOR DELETE
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── patients — clinic member SELECT extension ─────────────────────────────────

-- SELECT: clinic members can see all patients assigned to their clinic.
-- Augments the existing "patients_select_own" (auth.uid() = user_id) policy.
-- PostgreSQL OR-evaluates multiple SELECT policies — personal + clinic access coexist.
-- NULL clinic_id is explicitly excluded: personal patients stay personal-only.
-- Soft-deleted rows (deleted_at IS NOT NULL) are included so clinic members
-- receive tombstone rows from cloudSync, enabling cross-device delete propagation.
-- INSERT/UPDATE/DELETE on clinic patients remain personal-ownership only (Phase 3.4+).
DO $$ BEGIN
  CREATE POLICY "patients_select_clinic_member"
    ON patients FOR SELECT
    USING (
      clinic_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM clinic_members
        WHERE clinic_members.clinic_id = patients.clinic_id
          AND clinic_members.user_id   = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Phase 3.4 — Lightweight Membership Model
-- ============================================================
--
-- PURPOSE: Enables operational clinic membership display and management.
-- The only schema addition in Phase 3.4 is one SELECT policy that lets the
-- clinic owner see their full member roster in the account panel.
--
-- DESIGN:
--   clinic_members_select_owner_roster augments clinic_members_select_self
--   (Phase 3.3). The two policies are OR-evaluated by PostgreSQL:
--     - Any user sees their own row (select_self).
--     - An owner additionally sees all rows for clinics they own (owner_roster).
--   The EXISTS check reads clinics via the direct owner_user_id branch in
--   clinics_select_member — no circular policy dependency introduced.
--
-- SEQUENCING BOUNDARIES (intentionally NOT in this phase):
--   - Email-based invitation flow          (Phase 3.5+)
--   - Member write access to patients      (Phase 3.5+)
--   - Cross-member collaborative edits     (Phase 3.5+)
--   - updated_at / edit flow for clinics   (Phase 3.5+)
--
-- NOTE: Schema version NOT bumped — behavioral policy addition only.
-- ============================================================

-- SELECT: clinic owner sees all member rows for clinics they own.
-- Members continue to see only their own row via clinic_members_select_self.
DO $$ BEGIN
  CREATE POLICY "clinic_members_select_owner_roster"
    ON clinic_members FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Phase 7 — Subscription Groundwork
-- ============================================================
--
-- PURPOSE: Establishes the minimal ownership boundary for future subscriptions.
-- This is foundational schema ONLY — no payment collection, no billing logic,
-- no feature-gating enforcement, no Stripe integration.
--
-- WHAT THIS ENABLES:
--   - Future subscription ownership: one subscription row per clinic
--   - Future plan association: plan_id (open text, no FK, extensible)
--   - Future entitlement checks: status field for lifecycle state
--   - Future Stripe mapping: external_billing_id (NULL until Stripe)
--   - Future billing period tracking: trial_ends_at, current_period_ends_at
--
-- WHAT IS INTENTIONALLY DEFERRED:
--   - Stripe checkout / payment collection      (Phase 8+)
--   - Feature-gating enforcement / plan limits  (Phase 8+)
--   - Subscription creation UI / onboarding     (Phase 8+)
--   - Invoice records / payment history         (future)
--   - Seat accounting / per-user billing        (future)
--   - Webhook receivers / payment retries       (future)
--
-- SAFETY PROPERTIES:
--   - Additive: no existing tables or rows are touched.
--   - Absent row = no subscription (graceful pre-subscription / free state).
--   - ON DELETE CASCADE from clinics: subscription row removes with its clinic.
--   - RLS: owner-only — members never see billing metadata.
--   - No client code changes: local-first continuity fully preserved.
--
-- NOTE: patients.schema_ver NOT bumped — no change to the patients table.
--       Schema FILE revision bumped to 3 (see header comment).
-- ============================================================


-- ============================================================
-- TABLE: clinic_subscriptions
-- One row per clinic. Absent row = pre-subscription / free-baseline state.
-- Created when a clinic owner activates a plan (Phase 8+).
-- ============================================================

CREATE TABLE IF NOT EXISTS clinic_subscriptions (

  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership anchor. UNIQUE enforces one subscription per clinic.
  -- CASCADE: subscription row is removed when its clinic is deleted.
  clinic_id              uuid        NOT NULL UNIQUE
                                     REFERENCES clinics(id) ON DELETE CASCADE,

  -- Lifecycle status. Mirrors Stripe subscription status values for future
  -- direct mapping — no translation layer needed when Stripe is integrated.
  -- NULL  = no subscription created yet (free baseline / pre-subscription).
  -- Expected future values: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  -- Unconstrained text: adding new values never requires a schema migration.
  status                 text,

  -- Plan identifier. Open text — no FK to a plans table, extensible without
  -- additional migrations. Future values: 'clinic_monthly', 'clinic_annual', etc.
  -- NULL until the owner selects a plan.
  plan_id                text,

  -- External billing system identifier.
  -- NULL until Stripe (or alternative) is integrated.
  -- UNIQUE: one active billing subscription per clinic when non-null.
  -- Future: will hold Stripe's 'sub_xxxx' subscription ID.
  external_billing_id    text        UNIQUE,

  -- Subscription period boundaries. NULL until billing is active.
  trial_ends_at          timestamptz,
  current_period_ends_at timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()

);

-- Auto-update updated_at on any subscription row change.
DO $$ BEGIN
  CREATE TRIGGER clinic_subscriptions_updated_at
    BEFORE UPDATE ON clinic_subscriptions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- ROW LEVEL SECURITY — clinic_subscriptions
-- Owner-only: billing metadata is never visible to clinic members.
-- Uses the same clinics EXISTS pattern as other owner policies.
-- The direct owner_user_id branch in clinics_select_member terminates
-- the chain — no circular dependency introduced.
-- ============================================================

ALTER TABLE clinic_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "clinic_subscriptions_select_owner"
    ON clinic_subscriptions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "clinic_subscriptions_insert_owner"
    ON clinic_subscriptions FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "clinic_subscriptions_update_owner"
    ON clinic_subscriptions FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "clinic_subscriptions_delete_owner"
    ON clinic_subscriptions FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM clinics
        WHERE clinics.id            = clinic_id
          AND clinics.owner_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Phase 8 — Workflow Observation Groundwork
-- ============================================================
--
-- PURPOSE: Minimal friction observation table for operational signal capture.
-- No PHI. No user linkage. Write-only from the client perspective.
--
-- PRIVACY DESIGN:
--   - session_id is an ephemeral per-page-load UUID — NOT linked to auth.users.
--   - event_type is drawn from a closed allowlist in frictionLog.js.
--   - flags JSONB contains ONLY boolean/numeric values (enforced in frictionLog.js).
--   - No user_id column: rows are permanently anonymous at the schema level.
--
-- ACCESS CONTROL:
--   - Any authenticated user can INSERT their session events.
--   - No SELECT policy: client cannot read back its own observations.
--   - Analysis is done via Supabase dashboard (service role) only.
--
-- SAFETY PROPERTIES:
--   - Additive: no existing tables or rows are touched.
--   - Local-first: frictionLog.js buffers locally; upload is fire-and-forget.
--   - Offline-safe: if upload fails, local buffer is retained for next attempt.
--
-- NOTE: patients.schema_ver NOT bumped — no change to the patients table.
--       Schema FILE revision bumped to 4 (see header comment).
-- ============================================================


-- ============================================================
-- TABLE: workflow_observations
-- Operational friction signals. Anonymous. Write-only from client.
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_observations (

  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Per-page-load random UUID. Not linked to auth.users or clinics.
  -- Links events within a single session for pattern analysis only.
  session_id  text        NOT NULL,

  -- Allowlisted behavioral signal type (enforced in frictionLog.js).
  -- Examples: 'sync_error', 'offline_detected', 'hydrate_failed'.
  event_type  text        NOT NULL,

  -- Optional numeric/boolean context values only. Never strings (PHI guard).
  -- Example: { duration_ms: 1200, is_online: false }
  flags       jsonb,

  occurred_at timestamptz NOT NULL DEFAULT now()

);

-- Default-deny. Client has INSERT only — no SELECT from the client side.
ALTER TABLE workflow_observations ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can INSERT friction events for their session.
-- No SELECT policy: rows are write-only from client. Service role reads for analysis.
DO $$ BEGIN
  CREATE POLICY "observations_insert_authenticated"
    ON workflow_observations FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Phase 12 — Stripe Infrastructure
-- ============================================================
--
-- PURPOSE: Minimal reliable Stripe infrastructure for subscription lifecycle
-- synchronization. This is financial infrastructure engineering — boring,
-- predictable, recoverable, operationally safe.
--
-- WHAT THIS ADDS:
--   - stripe_customer_id on clinic_subscriptions (Stripe cus_xxx, set at checkout)
--   - stripe_event_at on clinic_subscriptions (guards out-of-order webhook delivery)
--   - upsert_clinic_subscription() RPC function (atomic, idempotent, ordered upsert)
--   - Stripe webhook Edge Function (supabase/functions/stripe-webhook/index.ts)
--
-- SECURITY CHANGE:
--   Phase 7 added client-facing INSERT/UPDATE/DELETE policies on clinic_subscriptions.
--   Phase 12 removes them — all billing table writes now come from the webhook handler
--   (service role) or future server-side checkout Edge Functions (service role).
--   Clients retain SELECT-only access to read their own subscription status.
--   This prevents client-side manipulation of subscription state.
--
-- CLINIC MAPPING CONTRACT (REQUIRED by checkout function):
--   When creating a Stripe checkout session or subscription, the checkout Edge
--   Function MUST embed metadata.clinic_id = clinicId on the Stripe subscription.
--   The webhook handler uses subscription.metadata.clinic_id as the authoritative
--   mapping key. Events without this metadata are logged and permanently skipped.
--
-- WHAT IS INTENTIONALLY DEFERRED:
--   - Stripe Checkout / payment collection UI     (Phase 12.5 / checkout function)
--   - Feature-gating / plan entitlement checks    (Phase 12.5+)
--   - Subscription creation UX / onboarding flow  (Phase 12.5+)
--   - Invoice records / payment history table      (future)
--   - Dunning / retry management                  (future)
--
-- SAFETY PROPERTIES:
--   - Additive columns: no existing rows touched, all new columns are nullable.
--   - Atomic RPC: upsert_clinic_subscription() uses ON CONFLICT DO UPDATE WHERE
--     to apply events only when strictly newer — replay and out-of-order safe.
--   - Transient Stripe failures do NOT revoke clinical access — no entitlement
--     enforcement exists until Phase 12.5+ explicitly adds it.
--   - Local-first continuity fully preserved — no client code changes in Phase 12.
--
-- NOTE: patients.schema_ver NOT bumped — no change to the patients table.
--       Schema FILE revision bumped to 5 (see header comment).
-- ============================================================


-- ── Add Stripe columns to clinic_subscriptions ───────────────────────────────

-- Stripe Customer ID (cus_xxx). Set by checkout Edge Function when clinic owner
-- initiates checkout. Linked to external_billing_id (sub_xxx, Stripe subscription).
-- UNIQUE: one Stripe customer per clinic when non-null (NULLs do not conflict).
ALTER TABLE clinic_subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;

DO $$ BEGIN
  ALTER TABLE clinic_subscriptions
    ADD CONSTRAINT clinic_subscriptions_stripe_customer_unique
    UNIQUE (stripe_customer_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stores the Stripe event.created timestamp of the last-applied webhook event.
-- Guards against out-of-order delivery: the upsert RPC only applies an event when
-- stripe_event_at IS NULL (first event) or the incoming event is strictly newer.
-- Replay of the same event (same timestamp) is a no-op.
ALTER TABLE clinic_subscriptions ADD COLUMN IF NOT EXISTS stripe_event_at timestamptz;


-- ── Index: webhook lookup by Stripe customer ID ──────────────────────────────
-- Used by: future checkout function when it links customer → subscription row.
-- Partial: NULL stripe_customer_id rows have no billing routing need.

CREATE INDEX IF NOT EXISTS clinic_subscriptions_customer_idx
  ON clinic_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- ── Remove client-facing write policies on clinic_subscriptions ──────────────
-- All billing writes are now server-side (service role). Clients have SELECT only.
-- Future checkout functions use service role and do not require these policies.
-- DROP IF EXISTS is idempotent — safe on databases where policies were never applied.

DROP POLICY IF EXISTS "clinic_subscriptions_insert_owner" ON clinic_subscriptions;
DROP POLICY IF EXISTS "clinic_subscriptions_update_owner" ON clinic_subscriptions;
DROP POLICY IF EXISTS "clinic_subscriptions_delete_owner" ON clinic_subscriptions;


-- ── RPC: upsert_clinic_subscription ─────────────────────────────────────────
-- Atomic, idempotent subscription state upsert for the Stripe webhook handler.
-- Called via supabase.rpc() with service role key (bypasses RLS).
--
-- OUT-OF-ORDER SAFETY:
--   The ON CONFLICT DO UPDATE WHERE clause applies the upsert only when the
--   incoming event (p_stripe_event_at) is strictly newer than the stored event.
--   - Same event replayed: p_stripe_event_at = stored → WHERE FALSE → no-op ✓
--   - Older event received late: p_stripe_event_at < stored → WHERE FALSE → no-op ✓
--   - Newer event: p_stripe_event_at > stored → WHERE TRUE → applies ✓
--   - First event: stripe_event_at IS NULL → WHERE TRUE → applies ✓
--
-- CALLED BY: supabase/functions/stripe-webhook/index.ts
-- CALLER MUST USE: service role key (or SECURITY DEFINER for future RLS contexts)

CREATE OR REPLACE FUNCTION upsert_clinic_subscription(
  p_clinic_id              uuid,
  p_stripe_customer_id     text,
  p_external_billing_id    text,
  p_status                 text,
  p_plan_id                text,
  p_trial_ends_at          timestamptz,
  p_current_period_ends_at timestamptz,
  p_stripe_event_at        timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO clinic_subscriptions (
    clinic_id,
    stripe_customer_id,
    external_billing_id,
    status,
    plan_id,
    trial_ends_at,
    current_period_ends_at,
    stripe_event_at
  )
  VALUES (
    p_clinic_id,
    p_stripe_customer_id,
    p_external_billing_id,
    p_status,
    p_plan_id,
    p_trial_ends_at,
    p_current_period_ends_at,
    p_stripe_event_at
  )
  ON CONFLICT (clinic_id) DO UPDATE
    SET
      stripe_customer_id     = EXCLUDED.stripe_customer_id,
      external_billing_id    = EXCLUDED.external_billing_id,
      status                 = EXCLUDED.status,
      plan_id                = EXCLUDED.plan_id,
      trial_ends_at          = EXCLUDED.trial_ends_at,
      current_period_ends_at = EXCLUDED.current_period_ends_at,
      stripe_event_at        = EXCLUDED.stripe_event_at
    WHERE (
      clinic_subscriptions.stripe_event_at IS NULL
      OR clinic_subscriptions.stripe_event_at < EXCLUDED.stripe_event_at
    );
END;
$$;


-- ============================================================
-- PHASE 13: Feature Gating
-- Applied after Phase 12. Run idempotently on existing databases.
--
-- Adds: clinic_subscriptions SELECT policy for clinic members.
--
-- WHY: Phase 12 left SELECT on clinic_subscriptions as owner-only.
-- For entitlement checks to work for all clinic members (not just the
-- owner), members must be able to read their clinic's subscription status.
-- This is operational metadata (plan status), not financial detail.
-- ============================================================

-- Allow all clinic members to read their clinic's subscription status.
-- Members need this for entitlement checks (canUse() in entitlements.js).
-- Scope: SELECT only. INSERT/UPDATE/DELETE remain server-side (service role).
DO $$ BEGIN
  CREATE POLICY "clinic_subscriptions_select_member"
    ON clinic_subscriptions FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM clinic_members
        WHERE clinic_members.clinic_id = clinic_subscriptions.clinic_id
          AND clinic_members.user_id   = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
