const path = require('path');
const os = require('os');
const app = require('./app');
const config = require('./config');
const { startBackupService } = require('./backupService');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = config.PORT;
let server = null;

if (!process.env.VERCEL) {
  server = app.listen(PORT, '0.0.0.0', () => {
    const lanIp = getLanIp();
    console.log('====================================================');
    console.log('  ⚡ FINAL OVERRIDE — INVICTORS CLUB MISSION SYSTEM ⚡');
    console.log('====================================================');
    console.log(`  Local:        http://localhost:${PORT}`);
    console.log(`  LAN URL:      http://${lanIp}:${PORT}`);
    console.log(`  Coordinator:  http://${lanIp}:${PORT}/coordinator`);
    console.log(`  Admin Panel:  http://${lanIp}:${PORT}/admin`);
    console.log(`  Leaderboard:  http://${lanIp}:${PORT}/leaderboard`);
    console.log('====================================================');

    // Start rolling 5-minute SQLite backups if local database file is in use
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'final_override.db');
    startBackupService(dbPath);
  });
}

module.exports = { app, server };
