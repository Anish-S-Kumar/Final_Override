-- ==============================================================================
-- FINAL OVERRIDE — MIGRATION 003: STAGE 2 WORKBENCH & EVENT STATE (SQLITE)
-- ==============================================================================

-- 1. Stage 2 Workbench persistence
CREATE TABLE IF NOT EXISTS stage2_workbench (
  team_id TEXT PRIMARY KEY,
  payload_loaded INTEGER NOT NULL DEFAULT 0,
  steps TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage2_workbench_team ON stage2_workbench(team_id);

-- 2. Stage 2 Workbench Audit Log
CREATE TABLE IF NOT EXISTS stage2_workbench_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  version_after INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage2_log_team ON stage2_workbench_log(team_id);

-- 3. Canonical Event State (single-row table id=1)
CREATE TABLE IF NOT EXISTS event_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at INTEGER,
  paused_at INTEGER,
  total_paused_ms INTEGER NOT NULL DEFAULT 0,
  is_paused INTEGER NOT NULL DEFAULT 0,
  cap_minutes INTEGER NOT NULL DEFAULT 90,
  mode TEXT NOT NULL DEFAULT 'self_paced',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO event_state (id, started_at, paused_at, total_paused_ms, is_paused, cap_minutes, mode, updated_at)
VALUES (1, NULL, NULL, 0, 0, 90, 'self_paced', strftime('%s','now') * 1000);
