-- FINAL OVERRIDE — Migration 004: Stage 1 Repeatable Morse Chart & Hint Policies
-- Idempotent and safe to run multiple times.

-- 1. Create hint_policy table
CREATE TABLE IF NOT EXISTS hint_policy (
  stage INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('chart', 'text')),
  max_uses INTEGER,
  cost_schedule_minutes TEXT NOT NULL DEFAULT '[3,5]',
  display_seconds INTEGER NOT NULL DEFAULT 30,
  enabled INTEGER NOT NULL DEFAULT 1,
  edited_by_admin INTEGER DEFAULT 0,
  updated_by TEXT DEFAULT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Seed initial hint policies (never overwriting admin edits)
INSERT INTO hint_policy (stage, kind, max_uses, cost_schedule_minutes, display_seconds, enabled, edited_by_admin, updated_at)
VALUES
  (1, 'chart', NULL, '[3,5]', 30, 1, 0, strftime('%s','now') * 1000),
  (2, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
  (3, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
  (4, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
  (5, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
  (6, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000)
ON CONFLICT(stage) DO UPDATE SET
  kind = excluded.kind,
  max_uses = excluded.max_uses,
  cost_schedule_minutes = excluded.cost_schedule_minutes,
  display_seconds = excluded.display_seconds,
  enabled = excluded.enabled
WHERE COALESCE(hint_policy.edited_by_admin, 0) = 0;

-- 3. Delete legacy Stage 1 text hint definitions from hint_config
DELETE FROM hint_config WHERE stage = 1;

-- 4. Ensure hint_usage columns and indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_hint_usage_team_stage_number ON hint_usage(teamId, stage, hintNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hint_usage_team_idemp ON hint_usage(teamId, idempotencyKey) WHERE idempotencyKey IS NOT NULL;

-- 5. Record schema version
INSERT OR REPLACE INTO schema_version (version, applied_at)
VALUES (4, strftime('%s','now') * 1000);
