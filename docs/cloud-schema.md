# denai — Cloud Schema Design & Persistence Contracts

> Wave 7C design document. READ ONLY. No runtime changes.
> Canonical schema artifact: `src/db/schema.sql`
> Apply schema via Supabase Studio SQL Editor before Wave 7D implementation.

---

## Design Philosophy

**Local-first. Cloud-additive.**

The application renders 100% from localStorage. Cloud is a durable backup and multi-device sync layer. The schema must not impose latency, coupling, or runtime dependencies on the clinical render pipeline.

**Three non-negotiable invariants:**

1. A patient record loads from localStorage in zero network round-trips, always.
2. The `notes` field is local-only until Wave 7G (client-side encryption).
3. AI outputs are never stored anywhere — they are deterministic functions of the clinical state.

---

## 1. Table Structure

### `profiles`

One row per authenticated user. Created on first sign-in (upserted by the sync module).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | `= auth.users.id` |
| `created_at` | `timestamptz` | server default `now()` |
| `updated_at` | `timestamptz` | auto-touched by trigger |
| `preferences` | `jsonb` | `{ darkMode, defaultCosts }` — no PHI |

**preferences JSONB shape:**
```json
{
  "darkMode": false,
  "defaultCosts": {
    "costImplant": 4500,
    "costBridge": 3500,
    "costBoneGraft": 1500,
    "costCrown": 1200,
    "costRCT": 1000,
    "costPostCore": 400
  }
}
```

### `patients`

One row per patient record. The primary persistence target.

| Column | Type | Notes |
|---|---|---|
| `id` | `text PK` | Client-generated: `p_<timestamp>_<random>` |
| `user_id` | `uuid FK → auth.users` | Ownership anchor; CASCADE DELETE |
| `case_num` | `text` | `'#4587'` — typed for list queries |
| `name` | `text` | Patient display name — typed for list queries |
| `created_at` | `timestamptz` | Server default `now()` |
| `updated_at` | `timestamptz` | Auto-touched; used for conflict resolution |
| `deleted_at` | `timestamptz` | `NULL` = active; non-null = soft-deleted |
| `state` | `jsonb` | Full clinical payload — see Field Map below |
| `history` | `jsonb` | `[{time, action, details}]` — capped 50 entries |
| `notes_enc` | `text` | `NULL` until Wave 7G — encrypted notes |
| `schema_ver` | `smallint` | Version 1 = Wave 7C schema |

---

## 2. Patient State Field Map

### Synced into `state` JSONB (clinical payload)

All DEFAULT_STATE fields except the exclusions below:

```
age, gender, tooth, condition, bone, hygiene, occlusion, tx,
smoking, diabetes, remainingStructure, endodonticStatus, parafunction,
multiTooth, tooth2, abutmentQuality,
multiSite, site2Tooth, site2Condition, site2Structure, site2EndoStatus,
costImplant, costBridge, costBoneGraft, costCrown, costRCT, costPostCore,
name, id, caseNum   ← redundant with typed columns; included for single-fetch convenience
```

### NOT synced — explicit exclusions

| Field | Location | Reason |
|---|---|---|
| `notes` | Local-only (localStorage) | Free-text PHI — deferred to Wave 7G encryption |
| `activeSite` | Session-local (in-memory) | Device-local navigation state; meaningless on another device |
| AI outputs (`rec`, `conf`, `confLevel`, etc.) | Recomputed on load | Deterministic functions of state — never store |
| `tempState` (what-if panel) | In-memory only | Ephemeral session scratch space |
| `UIState` (`editing`, `whyOpen`, `historyOpen`) | In-memory only | Ephemeral per-session UI flags |
| `StateDiffs` ring buffer | In-memory only | Diagnostic only |

### `activeSite` — critical note

`activeSite` lives in `S` (not `UIState`) because it controls render routing (see Decision Log 2026-05-14). However, it is NOT a persistent clinical field — it reflects which site tab the user last clicked. The Wave 7D serializer must strip it from the cloud payload. Omitting it from `state` JSONB on read causes the local spread `{ ...DEFAULT_STATE, ...stateFromCloud }` to fill it with `DEFAULT_STATE.activeSite = 1`, which is the correct reset behavior on new devices.

---

## 3. Notes & PHI Strategy

### PHI Classification

| Field | Classification | Wave 7D Policy |
|---|---|---|
| `name` | PII / PHI | Sync (in typed column + JSONB) |
| `age`, `gender` | PHI | Sync (in JSONB) |
| `tooth`, `condition`, `bone` | Clinical PHI | Sync (in JSONB) |
| `smoking`, `diabetes`, `hygiene` | Clinical PHI | Sync (in JSONB) |
| `notes` | **High PHI** — free-text | **LOCAL-ONLY until Wave 7G** |
| `costImplant`, `costBridge`, etc. | Financial | Sync (in JSONB) |
| `caseNum` | Identifier | Sync (typed column) |

### Interim Policy (Wave 7D–7F)

The Wave 7D sync serializer strips `notes` from the payload before upload:
```javascript
const { notes, activeSite, ...syncableState } = patientRecord;
// Upload only syncableState + history
```

Users who rely on `notes` must use a single device, or accept that notes do not sync until Wave 7G.

### Wave 7G — Encrypted Notes Design

- **Encryption:** AES-GCM 256-bit via `window.crypto.subtle`
- **Key derivation:** PBKDF2 from user password (or Supabase Vault for key storage)
- **Storage:** Base64-encoded ciphertext in `notes_enc` column
- **Column:** `notes_enc text` is already in the schema (NULL until Wave 7G)
- **Risk:** Key loss = permanent notes loss. Do not rush Wave 7G. Key management plan required before implementation.

### BAA Requirement

Full HIPAA compliance requires a Business Associate Agreement with Supabase. Supabase free/Pro tiers do not include a BAA. BAA is available on Enterprise tier. **No real patient data should be entered until the BAA is signed.** The existing `BRAND.disclaimer` already acknowledges clinical decision-support-only use.

---

## 4. Row-Level Security

### Threat model

All client requests are authenticated via Supabase JWT. The anon key is public — it grants no access beyond what RLS allows. The risk is a bug in application code that accidentally queries another user's data. RLS is the architectural guarantee that this is impossible even if application code is buggy.

### Attack surface eliminated by RLS

- `SELECT * FROM patients` — returns only the authenticated user's rows
- `UPDATE patients SET user_id = <other_uid>` — blocked by `WITH CHECK`
- `INSERT INTO patients (user_id, ...) VALUES (<other_uid>, ...)` — blocked
- Direct Supabase API calls from the browser dev console — blocked by JWT + RLS

### Policies

```sql
-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING  (auth.uid() = id)
              WITH CHECK (auth.uid() = id);

-- No DELETE policy — cascade via auth.users handles cleanup.


-- PATIENTS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_select_own" ON patients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "patients_insert_own" ON patients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "patients_update_own" ON patients
  FOR UPDATE USING  (auth.uid() = user_id)
              WITH CHECK (auth.uid() = user_id);

CREATE POLICY "patients_delete_own" ON patients
  FOR DELETE USING (auth.uid() = user_id);
```

### Default-deny verification

After applying RLS, verify in Supabase Table Editor:

- An anonymous request with no JWT → 0 rows
- A request with user A's JWT → only user A's rows
- A request with user A's JWT attempting `user_id = <user_B_uuid>` → blocked at INSERT/UPDATE

---

## 5. Schema Evolution Strategy

### The localStorage mismatch problem

localStorage uses key versioning (`dandyCaseState_v8`) to handle schema changes — the entire key is renamed, old data is migrated in JS, new key is populated. This approach does not translate to cloud: Supabase rows have stable `id` primary keys. Schema changes go through SQL migrations, not key renames.

### Rules for safe schema evolution

**Rule 1: New JSONB fields require no SQL migration.**
Adding a field to `DEFAULT_STATE` is automatically handled by the JS spread:
```javascript
const loadedState = { ...DEFAULT_STATE, ...stateFromCloud };
// Missing fields in stateFromCloud are filled by DEFAULT_STATE defaults.
```

**Rule 2: New typed columns must be `NULLABLE` or have a `DEFAULT`.**
```sql
-- SAFE: existing rows get NULL or the default
ALTER TABLE patients ADD COLUMN new_field text;
ALTER TABLE patients ADD COLUMN new_score smallint DEFAULT 0;

-- UNSAFE: existing rows have no value for NOT NULL without DEFAULT
ALTER TABLE patients ADD COLUMN new_field text NOT NULL; -- will fail
```

**Rule 3: `schema_ver` tracks migration state of each row.**
```sql
-- After a migration that transforms existing rows:
UPDATE patients SET schema_ver = 2 WHERE schema_ver = 1;
```
The sync module reads `schema_ver` and can apply client-side transforms for rows that pre-date a migration.

**Rule 4: Removing a JSONB field is a three-wave operation.**
```
Wave N:   Stop writing the field (remove from serializer)
Wave N+1: All clients have the field-free serializer (old field present in JSONB, ignored)
Wave N+2: SQL cleanup: UPDATE patients SET state = state - 'old_field';
```
Never do wave N and N+2 in the same release.

**Rule 5: Never rename a JSONB key in-place.**
Rename = add new key + backfill + remove old key (three-wave). Offline users syncing after a rename would overwrite the new key with the old key if the serializer writes both names simultaneously.

**Rule 6: The `schema_ver` constant in the sync module must be updated alongside `schema.sql`.**
A constant `SYNC_SCHEMA_VERSION = 1` in the Wave 7D sync module must match `DEFAULT 1` in `schema.sql`. When the schema changes, both must be bumped atomically.

---

## 6. Sync Queue Contract

Design for Wave 7D implementation. This is the shape of a queued sync operation.

### SyncOp shape

```typescript
type SyncOp = {
  // Idempotency key. Supabase UPSERT uses patient_id for DB-level idempotency,
  // but this UUID allows the queue to deduplicate in-flight retries.
  id:          string;                          // crypto.randomUUID()

  type:        'upsert' | 'soft-delete';

  entity:      'patient' | 'preference';        // which table

  patient_id:  string | null;                   // set for entity='patient'

  // The serialized cloud payload. For 'patient': syncableState object.
  // For 'soft-delete': null (server sets deleted_at = now()).
  // For 'preference': preferences object.
  payload:     Record<string, unknown> | null;

  local_ts:    number;                          // Date.now() when op was created
                                                // Used for conflict detection vs server updated_at

  attempts:    number;                          // starts at 0; max 5 before permanent failure

  last_error:  string | null;                   // last error message for diagnostics
};
```

### Queue storage

- **In-memory:** `_syncQueue` array in `syncModule.js` (Wave 7D new file)
- **Persistence across reloads:** `localStorage.getItem('dandySyncQueue_v1')` — serialized JSON array
- **Flush trigger:** After every successful localStorage write (via hook in `saveState()` debounce); also on `online` event

### Idempotency contract

The Supabase UPSERT pattern is inherently idempotent:
```sql
INSERT INTO patients (id, user_id, ...)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET ...
WHERE patients.updated_at < EXCLUDED.updated_at;
```
Re-sending the same `patient_id` with the same `updated_at` is a no-op. Re-sending with an older `local_ts` than the server's `updated_at` is also a no-op (the `WHERE` clause prevents downgrade).

### Conflict resolution (last-write-wins)

For single-user single-device (Wave 7D): no conflict possible.

For multi-device (Wave 7E): if device A and device B both edit patient P while offline:
- Both queue an `upsert` for patient P
- The one that flushes last wins (`updated_at` comparison)
- Denai is a single-clinician tool — true concurrent edits from two devices are rare and acceptable to lose the earlier one

For true merge semantics (future): would require field-level conflict resolution. Deferred indefinitely — the Wave 7A recon explicitly rejected real-time collaboration.

---

## 7. Export / Backup Architecture

### Full export JSON shape

```json
{
  "export_version": 1,
  "exported_at": "2026-05-15T22:00:00.000Z",
  "app_version": "2.0.0",
  "patients": [
    {
      "id": "p_1748xxx_abc12",
      "caseNum": "#4587",
      "name": "Mohamed A.",
      "age": 45,
      "gender": "Male",
      "tooth": "#6",
      "condition": "Missing tooth",
      "bone": "Good",
      "hygiene": "Good",
      "occlusion": "High occlusion load",
      "tx": "implant",
      "smoking": "Non-smoker",
      "diabetes": "None",
      "remainingStructure": "Good",
      "endodonticStatus": "No RCT needed",
      "parafunction": "None",
      "multiTooth": false,
      "tooth2": null,
      "abutmentQuality": "Good",
      "multiSite": false,
      "activeSite": 1,
      "site2Tooth": "#11",
      "site2Condition": "Missing tooth",
      "site2Structure": "Good",
      "site2EndoStatus": "No RCT needed",
      "costImplant": 4500,
      "costBridge": 3500,
      "costBoneGraft": 1500,
      "costCrown": 1200,
      "costRCT": 1000,
      "costPostCore": 400,
      "notes": "Patient notes here — included in export even though not synced to cloud"
    }
  ],
  "history": {
    "p_1748xxx_abc12": [
      { "time": "2026-05-15T10:00:00.000Z", "action": "Patient data edited", "details": "Tooth #6, Bone Good" }
    ]
  },
  "preferences": {
    "darkMode": false
  }
}
```

### Portability guarantees

- `notes` IS included in exports — it is the user's own data.
- `activeSite` IS included — no harm in exporting device-local state.
- AI outputs are NOT included — they are always reconstructable.
- Export format is identical to the localStorage `dandyPatients_v2` array (plus the wrapper) — no transformation needed for re-import.

### Import / restore semantics

On import:
1. Validate `export_version` — must be `>= 1`
2. For each patient in `patients[]`: upsert into `dandyPatients_v2` by `id`
3. For each patient history: upsert into `dandyCaseHistory_v1_<id>`
4. Merge preferences (do not overwrite current device's `darkMode` without prompting)
5. No cloud writes during import — re-sync happens naturally via sync queue

### Version tagging

`export_version` must be bumped whenever the export shape changes (fields added/removed/renamed). The import logic reads `export_version` to apply the correct deserialization path. Version 1 = Wave 7C onward.

---

## 8. Performance & Scale Audit

### Row size estimate

| Component | Typical size |
|---|---|
| `state` JSONB (30 fields, all small values) | ~900 bytes |
| `history` JSONB (50 entries × ~80 bytes) | ~4 KB |
| `name`, `case_num`, typed columns | ~100 bytes |
| `notes_enc` (Wave 7G+, encrypted notes) | ~2–4 KB |
| PostgreSQL row overhead | ~100 bytes |
| **Total per patient** | **~5–9 KB** |

### Scale projections

| Users | Patients/user | Total rows | DB size |
|---|---|---|---|
| 100 | 50 | 5,000 | ~50 MB |
| 1,000 | 50 | 50,000 | ~500 MB |
| 10,000 | 50 | 500,000 | ~5 GB |

Supabase free tier: 500 MB. Adequate for up to ~1,000 users. Pro tier ($25/mo) handles 8 GB — adequate for up to ~16,000 users before requiring partitioning.

### Query patterns (Wave 7D/7E)

| Query | Frequency | Covered by index |
|---|---|---|
| List all active patients for user | On every login / app load | `patients_user_active_idx` |
| Load single patient by id | On patient switch | PK (no index needed) |
| Upsert patient on save | Every autosave (300ms debounce) | PK |
| Sync: fetch patients updated after timestamp | On reconnect | `patients_user_updated_idx` |
| Soft-delete patient | On user action | PK |

### What becomes expensive first

1. **`history` JSONB bloat** — if capped at 50 entries per patient, this is bounded. If the cap is lifted, history can dominate row size.
2. **Full patient list on every load** — at 50 patients × 9 KB, a full list fetch is ~450 KB. For 500 patients, it becomes ~4.5 MB. Recommendation: paginate or load on-demand when patient count exceeds 100.
3. **`notes_enc` size** — encrypted notes can grow large. AES-GCM adds ~80 bytes overhead per field; long notes may reach 10–20 KB.

### What should stay local forever

- `StateDiffs` ring buffer
- `tempState` (what-if panel scratch)
- `UIState` flags
- `activeSite`
- All AI computation results

---

## 9. Final Recommended Schema

See [`src/db/schema.sql`](../src/db/schema.sql) for the executable DDL.

### Summary

```
Tables:   2    (patients, profiles)
Indexes:  3    (patients_user_active_idx, patients_user_updated_idx, patients_user_deleted_idx)
Policies: 7    (3 on profiles, 4 on patients)
Triggers: 2    (touch_updated_at on both tables)
```

### Pre-Wave-7D checklist (required before implementing sync)

- [ ] Supabase project created with real credentials
- [ ] `schema.sql` applied via Supabase Studio SQL Editor
- [ ] RLS verified: anonymous request returns 0 rows from `patients`
- [ ] RLS verified: authenticated request returns only own rows
- [ ] `auth.users` email confirmations tested (sign-up → confirm → sign-in)
- [ ] Real credentials substituted in `src/auth/authModule.js` (replace `placeholder.supabase.co`)
- [ ] `authModule.js?v=` bumped to `v=2.1.0` (or next patch version)
- [ ] `notes` exclusion from sync payload confirmed in Wave 7D serializer
- [ ] `activeSite` exclusion from sync payload confirmed in Wave 7D serializer

---

## 10. Readiness Assessment

**Schema is ready for Wave 7D implementation.** The design is minimal, forward-compatible, and preserves the local-first invariant.

### Biggest risks before Wave 7D

| Risk | Severity | Mitigation |
|---|---|---|
| RLS policies not applied | **CRITICAL** | Verify before ANY data write — cross-user leakage otherwise |
| Real credentials not substituted in authModule.js | HIGH | Auth stays in local-mode fallback; sync never activates |
| `notes` accidentally included in sync payload | HIGH | Explicitly strip in Wave 7D serializer; add a test assertion |
| `activeSite` accidentally included in sync payload | MEDIUM | Strips cleanly via spread; include in serializer test |
| Supabase project paused (free tier) | MEDIUM | Upgrade to Pro before clinical use |
| `dandy-v1` SW activating if blob: CSP is fixed | MEDIUM | Rename to `denai-v2.x` in same wave that adds blob: to CSP |

### What MUST be frozen before Wave 7D begins

1. The `id` field format (`p_<timestamp>_<random>`) — it becomes the cloud PK; changing it after write breaks all sync
2. The `SYNC_SCHEMA_VERSION = 1` constant — bump only with a corresponding migration
3. The exclusion list: `notes`, `activeSite`, all AI outputs — write a serializer function test that asserts their absence

### What is intentionally deferred

- `notes_enc` (Wave 7G) — requires SubtleCrypto implementation + key management design
- HIPAA BAA — legal/business milestone, not technical
- History sync optimization — current design embeds history in the patient row (bounded, simple); a separate `patient_events` table is unnecessary until patient counts exceed ~500
- Full export UI — the JSON structure is designed; Wave 7F implements the button
