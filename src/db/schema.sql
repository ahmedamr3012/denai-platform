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
-- SCHEMA VERSION: 1  (bump when any column is added/changed)
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

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


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

  -- ── Migration tracking ────────────────────────────────────
  -- Incremented when a schema-breaking change requires data transformation.
  -- Version 1 = Wave 7C schema.
  schema_ver  smallint    NOT NULL DEFAULT 1

);

-- Auto-update updated_at
CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


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
