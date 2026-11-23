# FINAL OVERRIDE — Database Migration History & Changelog

This document tracks all database schema revisions, migrations, and remote upgrade procedures for **FINAL OVERRIDE**.

---

## 1. Dual-Provider Migration Matrix

The repository maintains schema parity between local SQLite (development/offline fallback) and hosted Supabase PostgreSQL (production/multiplayer cloud).

| Version | SQLite Migration File | Supabase Migration File | Description |
| :--- | :--- | :--- | :--- |
| **v1** | `001_initial.sql` | `001_initial.sql` | Initial schema: teams, members, progress, submissions, hints, chat. |
| **v2** | `002_add_member_count.sql` | `002_hardening.sql` / `003_three_to_four_members.sql` | Optional Member 4 support (`memberCount` 3–4), RLS hardening. |
| **v3 / v4** | *(runtime timing)* | `004_stage1_memorise.sql` | Stage 1 two-phase timing (`stage1EnteredAt`, `stage1OpensAt`). |
| **v3 (SQLite) / v5 (Supabase)** | `003_stage2_admin.sql` | `005_stage2_admin.sql` | Stage 2 workbench persistence, audit log, event state, admin hint flags, RPCs. |
| **v4 (SQLite) / v6 (Supabase)** | `004_stage1_hints.sql` | `006_stage1_hints.sql` | Stage 1 repeatable Morse chart reveal policy, `hint_policy` catalog, legacy text hint purge, atomic `request_hint` stored procedure. |

---

## 2. Migration Details: SQLite `003_stage2_admin.sql` / Supabase `005_stage2_admin.sql`

### 2.1 New Tables

#### `stage2_workbench`
Stores synchronized cryptanalyst workbench state per squad.
```sql
CREATE TABLE IF NOT EXISTS stage2_workbench (
  team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  payload_loaded INTEGER NOT NULL DEFAULT 0,
  steps TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
```
*(In Supabase PostgreSQL, `payload_loaded` is `BOOLEAN` and `steps` is `JSONB`).*

#### `stage2_workbench_log`
Immutable audit log of all transformations applied by teams.
```sql
CREATE TABLE IF NOT EXISTS stage2_workbench_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- BIGSERIAL in PostgreSQL
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,                         -- JSONB in PostgreSQL
  version INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_s2wb_log_team ON stage2_workbench_log(team_id);
```

#### `event_state`
Single-row global event clock and mode configuration.
```sql
CREATE TABLE IF NOT EXISTS event_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'self_paced' CHECK (mode IN ('self_paced', 'synchronized')),
  event_start_time BIGINT,
  cap_minutes INTEGER NOT NULL DEFAULT 90,
  is_paused INTEGER NOT NULL DEFAULT 0, -- BOOLEAN in PostgreSQL
  pause_start_time BIGINT,
  total_paused_ms BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);
```

### 2.2 Table Alterations

#### `hint_config`
Added admin tracking flags to prevent mission config file synchronization from overwriting manually edited hints:
```sql
ALTER TABLE hint_config ADD COLUMN edited_by_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hint_config ADD COLUMN updated_by TEXT;
```

---

## 3. Remote Stored Procedures (Supabase PostgreSQL)

Supabase Migration 005 adds four `SECURITY DEFINER` atomic RPCs with strict `SET search_path = ''`:

1. `stage2_workbench_get(p_team_id TEXT)`: Fetches or lazily initializes the workbench row for a team.
2. `stage2_workbench_save(p_team_id, p_payload_loaded, p_steps, p_expected_version, p_now, p_action, p_details)`:
   - Performs optimistic concurrency check (`WHERE version = p_expected_version`).
   - Increments version atomically: `version = version + 1`.
   - Inserts audit entry into `stage2_workbench_log`.
   - Returns `{ ok: true, state: ... }` or `{ ok: false, conflict: true, currentVersion: ... }`.
3. `event_state_get()`: Fetches the singleton `event_state` row.
4. `event_state_update(p_fields JSONB, p_now BIGINT)`: Modifies clock/mode settings and logs to `audit_log`.

---

## 4. Migration Details: SQLite `004_stage1_hints.sql` / Supabase `006_stage1_hints.sql`

### 4.1 New Tables

#### `hint_policy`
Stores stage-level hint policies separating Stage 1 repeatable chart reveals from Stages 2–6 text hints:
```sql
CREATE TABLE IF NOT EXISTS hint_policy (
  stage INTEGER PRIMARY KEY CHECK (stage >= 1 AND stage <= 6),
  kind TEXT NOT NULL CHECK (kind IN ('chart_reveal', 'text_hints')),
  displaySeconds INTEGER NOT NULL DEFAULT 30,
  costScheduleMinutes TEXT NOT NULL DEFAULT '[3, 5]',
  maxHints INTEGER NOT NULL DEFAULT -1,
  repeatable INTEGER NOT NULL DEFAULT 1 CHECK (repeatable IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updatedAt BIGINT NOT NULL
);
```

### 4.2 Legacy Row Purge
Purged obsolete Stage 1 text hints (`h1_1`, `h1_2`) from `hint_config` so they can never be rendered or leaked:
```sql
DELETE FROM hint_config WHERE stage = 1;
```

### 4.3 Constraint Modification on `hint_usage`
In Supabase PostgreSQL, lifted `CHECK ("hintNumber" IN (1, 2))` to `CHECK ("hintNumber" >= 1)` so repeatable hints on Stage 1 can record sequential usage numbers (`1, 2, 3...`).

### 4.4 Atomic Stored Procedure: `request_hint`
Supabase Migration 006 provides an atomic `SECURITY DEFINER` stored function `request_hint(p_team_id, p_stage, p_idempotency_key, p_now)` with `SET search_path = ''`:
1. Validates stage, team existence, and game active status.
2. If `p_idempotency_key` is provided and already recorded for the stage, returns previous transaction.
3. If an existing chart window is already active (`visibleUntil > p_now`), returns `{ ok: true, alreadyActive: true, costMinutes: 0 }` without deducting penalty.
4. Calculates next penalty from `hint_policy.costScheduleMinutes` (defaults to +3m for 1st use, +5m for subsequent uses).
5. Updates `teams.penaltyMin` and inserts into `hint_usage`.
6. Logs action to `audit_log`.

---

## 5. Applying Migrations & Verification

### SQLite
Run:
```bash
node scripts/migrate.js
node scripts/db_check.js --sqlite --smoke
```

### Supabase
For a clean project:
Execute `supabase/apply_all.sql` in the Supabase SQL Editor.

For upgrading an existing project from v5 to v6:
Execute `supabase/upgrade_003_stage1_hints.sql` in the Supabase SQL Editor.

Verify:
```bash
node scripts/db_check.js --supabase --smoke
```
