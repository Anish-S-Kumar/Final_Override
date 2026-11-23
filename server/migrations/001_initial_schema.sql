-- Migration 001: Initial Schema with 5 stages and team sequences
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE COLLATE NOCASE,
  coordinator TEXT COLLATE NOCASE,
  startedAt INTEGER NOT NULL,
  finishedAt INTEGER,
  stage INTEGER DEFAULT 1,
  penaltyMin INTEGER DEFAULT 0,
  pausedMs INTEGER DEFAULT 0,
  sessionToken TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  isPaused INTEGER DEFAULT 0,
  teamPauseStartedAt INTEGER DEFAULT 0,
  tabSwitches INTEGER DEFAULT 0,
  seed TEXT,
  version INTEGER DEFAULT 1,
  stage1EnteredAt INTEGER,
  stage1OpensAt INTEGER,
  memberCount INTEGER DEFAULT 4
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL,
  fullName TEXT NOT NULL,
  isLeader INTEGER NOT NULL DEFAULT 0,
  deviceToken TEXT,
  codeType TEXT,
  assignedCode TEXT,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_stages (
  stage INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS team_sequences (
  teamId TEXT PRIMARY KEY,
  fragmentOrder TEXT NOT NULL,
  expectedAnswer TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS progress (
  teamId TEXT NOT NULL,
  stage INTEGER NOT NULL,
  fragment TEXT,
  wrongAttempts INTEGER DEFAULT 0,
  hintsUsed INTEGER DEFAULT 0,
  solvedAt INTEGER,
  PRIMARY KEY (teamId, stage),
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL,
  stage INTEGER NOT NULL,
  valueHash TEXT,
  rawValue TEXT,
  ok INTEGER NOT NULL,
  at INTEGER NOT NULL,
  idempotencyKey TEXT,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hint_config (
  id TEXT PRIMARY KEY,
  stage INTEGER NOT NULL,
  hintNumber INTEGER NOT NULL,
  moduleName TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  category TEXT DEFAULT 'nudge',
  text TEXT NOT NULL,
  displayDurationSeconds INTEGER DEFAULT 0,
  penaltyMinutes INTEGER DEFAULT 3,
  displayOrder INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS hint_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL,
  stage INTEGER NOT NULL,
  hintId TEXT NOT NULL,
  hintNumber INTEGER NOT NULL,
  penaltyCharged INTEGER NOT NULL,
  shownAt INTEGER NOT NULL,
  visibleUntil INTEGER NOT NULL,
  idempotencyKey TEXT,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL,
  stage INTEGER DEFAULT 0,
  type TEXT NOT NULL,
  details TEXT,
  penaltyAdded INTEGER DEFAULT 0,
  at INTEGER NOT NULL,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leader_recovery (
  teamId TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  at INTEGER NOT NULL
);

-- Indexes for optimal concurrent read/write query execution
CREATE INDEX IF NOT EXISTS idx_members_teamId ON members(teamId);
CREATE INDEX IF NOT EXISTS idx_members_deviceToken ON members(deviceToken);
CREATE INDEX IF NOT EXISTS idx_progress_teamId ON progress(teamId);
CREATE INDEX IF NOT EXISTS idx_submissions_teamId_stage ON submissions(teamId, stage);
CREATE INDEX IF NOT EXISTS idx_submissions_at ON submissions(at);
CREATE INDEX IF NOT EXISTS idx_violations_teamId ON violations(teamId);
CREATE INDEX IF NOT EXISTS idx_hint_usage_teamId_stage ON hint_usage(teamId, stage);
CREATE INDEX IF NOT EXISTS idx_hint_config_stage ON hint_config(stage);
CREATE INDEX IF NOT EXISTS idx_teams_status_startedAt ON teams(status, startedAt);
