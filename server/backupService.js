const fs = require('fs');
const path = require('path');

let backupInterval = null;

function performBackup(dbFilePath) {
  if (!dbFilePath || dbFilePath === ':memory:') return;
  if (!fs.existsSync(dbFilePath)) return;

  const backupDir = path.join(path.dirname(dbFilePath), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `final_override-${timestamp}.db`);

  try {
    fs.copyFileSync(dbFilePath, backupFile);

    // Keep only the last 20 copies
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('final_override-') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        time: fs.statSync(path.join(backupDir, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 20) {
      files.slice(20).forEach(f => {
        try { fs.unlinkSync(f.path); } catch (_) {}
      });
    }
  } catch (err) {
    console.warn('[BACKUP] Warning during backup creation:', err.message);
  }
}

function startBackupService(dbFilePath, intervalMs = 5 * 60 * 1000) {
  if (process.env.NODE_ENV === 'test') return;
  if (!dbFilePath || dbFilePath === ':memory:') return;

  // Run initial backup after 1 minute, then every interval
  setTimeout(() => performBackup(dbFilePath), 60 * 1000);

  backupInterval = setInterval(() => {
    performBackup(dbFilePath);
  }, intervalMs);

  if (backupInterval.unref) {
    backupInterval.unref();
  }
}

function stopBackupService() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

module.exports = {
  performBackup,
  startBackupService,
  stopBackupService
};
