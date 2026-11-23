const Database = require('./sqliteAdapter');
const path = require('path');
const fs = require('fs');

let db = null;

if (Database) {
  try {
    let dbPath = process.env.DB_PATH;
    if (!dbPath) {
      const cwdLower = process.cwd().toLowerCase();
      const dirLower = __dirname.toLowerCase();
      const isOneDrive = cwdLower.includes('onedrive') || dirLower.includes('onedrive');

      if (isOneDrive) {
        console.warn('⚠️ [STORAGE WARNING] Working directory is inside OneDrive. SQLite WAL in cloud-synced folders risks file locking and database corruption.');
        const localSafeRoot = process.env.LOCALAPPDATA || process.env.TEMP || (process.platform === 'win32' ? 'C:\\temp' : '/tmp');
        const safeDir = path.join(localSafeRoot, 'FinalOverride', 'data');
        if (!fs.existsSync(safeDir)) {
          fs.mkdirSync(safeDir, { recursive: true });
        }
        dbPath = path.join(safeDir, 'final_override.db');
        console.log(`[STORAGE] SQLite path defaulted to outside OneDrive: ${dbPath}`);
      } else {
        dbPath = path.join(__dirname, '..', 'data', 'final_override.db');
      }
    }
    if (dbPath !== ':memory:') {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }

    db = new Database(dbPath);

    // Enable WAL mode for high performance concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
  } catch (err) {
    console.warn('SQLite initialization skipped:', err.message);
  }
}

function initSchema() {
  if (!db) return;
  const migrationPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
  if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    db.exec(migrationSql);
  } else {
    db.exec(`
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
        stage1OpensAt INTEGER
      );
    `);
  }

  // Ensure any runtime migrations or extra columns exist
  try { db.exec("ALTER TABLE teams ADD COLUMN status TEXT DEFAULT 'active'"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN isPaused INTEGER DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN teamPauseStartedAt INTEGER DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN tabSwitches INTEGER DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN seed TEXT"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN version INTEGER DEFAULT 1"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN stage1EnteredAt INTEGER"); } catch { }
  try { db.exec("ALTER TABLE teams ADD COLUMN stage1OpensAt INTEGER"); } catch { }
  try { db.exec("ALTER TABLE members ADD COLUMN codeType TEXT"); } catch { }
  try { db.exec("ALTER TABLE members ADD COLUMN assignedCode TEXT"); } catch { }
  try { db.exec("ALTER TABLE submissions ADD COLUMN rawValue TEXT"); } catch { }
  try { db.exec("ALTER TABLE submissions ADD COLUMN idempotencyKey TEXT"); } catch { }
  try { db.exec("ALTER TABLE violations ADD COLUMN stage INTEGER DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE hint_config ADD COLUMN edited_by_admin INTEGER DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE hint_config ADD COLUMN updated_by TEXT DEFAULT NULL"); } catch { }
  try { db.exec("CREATE TABLE IF NOT EXISTS leader_recovery (teamId TEXT PRIMARY KEY, code TEXT NOT NULL, expiresAt INTEGER NOT NULL, used INTEGER DEFAULT 0)"); } catch { }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stage2_workbench (
        team_id TEXT PRIMARY KEY,
        payload_loaded INTEGER NOT NULL DEFAULT 0,
        steps TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_stage2_workbench_team ON stage2_workbench(team_id);

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
      INSERT OR IGNORE INTO hint_policy (stage, kind, max_uses, cost_schedule_minutes, display_seconds, enabled, edited_by_admin, updated_at)
      VALUES
        (1, 'chart', NULL, '[3,5]', 30, 1, 0, strftime('%s','now') * 1000),
        (2, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
        (3, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
        (4, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
        (5, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000),
        (6, 'text', 2, '[3,5]', 0, 1, 0, strftime('%s','now') * 1000);

      DELETE FROM hint_config WHERE stage = 1;
    `);
  } catch { }

  // Ensure default settings exist
  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setStmt.run('clockPaused', 'false');
  setStmt.run('pauseStartedAt', '0');
  setStmt.run('allowNewTeams', 'false');
  setStmt.run('eventStartedAt', '0');
  setStmt.run('totalPausedMs', '0');
  setStmt.run('startTogetherMode', 'true');
  setStmt.run('gameStarted', 'false');
  setStmt.run('leaderboardFrozen', 'false');
  setStmt.run('winnersNotepad', '🏆 INVICTORS FINAL OVERRIDE — OFFICIAL WINNERS SCRATCHPAD\n=======================================================\n1st Place:\n2nd Place:\n3rd Place:\n\nSpecial Mentions:\nJudge Notes:\n');
}

initSchema();

module.exports = db;
module.exports.Database = Database;
