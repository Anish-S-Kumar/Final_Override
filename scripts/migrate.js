// FINAL OVERRIDE — Schema Migration Runner
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

function runMigrations() {
  console.log('🔄 Checking database schema migrations...');
  if (!db) {
    console.error('❌ Database connection not available.');
    process.exit(1);
  }

  // Ensure schema_version table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const migrationsDir = path.join(__dirname, '..', 'server', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const getVersionStmt = db.prepare('SELECT version FROM schema_version WHERE version = ?');
  const recordVersionStmt = db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');

  for (const file of files) {
    const match = file.match(/^(\d+)_/);
    if (!match) continue;
    const versionNum = parseInt(match[1], 10);

    const alreadyApplied = getVersionStmt.get(versionNum);
    if (!alreadyApplied) {
      console.log(`Applying migration ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      const tx = db.transaction(() => {
        try {
          db.exec(sql);
        } catch (execErr) {
          if (!execErr.message || !execErr.message.includes('duplicate column name')) {
            throw execErr;
          }
        }
        recordVersionStmt.run(versionNum, Date.now());
      });
      tx();
      console.log(`✅ Applied migration ${file}`);
    }
  }

  console.log('✅ Database schema is up to date.');
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
