const db = require('./db');
const readline = require('readline');

async function confirmWipe() {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    return true;
  }
  if (!process.stdin.isTTY) {
    console.error('Refusing to run without --yes flag in non-interactive environment.');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('⚠️ CAUTION: This will purge all database tables! Type WIPE to continue: ', answer => {
      rl.close();
      if (answer.trim() === 'WIPE') {
        resolve(true);
      } else {
        console.log('Aborted. Database was not modified.');
        process.exit(1);
      }
    });
  });
}

async function resetDatabase() {
  await confirmWipe();
  db.exec(`
    DELETE FROM submissions;
    DELETE FROM chat;
    DELETE FROM violations;
    DELETE FROM progress;
    DELETE FROM members;
    DELETE FROM teams;
    DELETE FROM settings;
    INSERT INTO settings (key, value) VALUES ('clockPaused', 'false');
    INSERT INTO settings (key, value) VALUES ('pauseStartedAt', '0');
    INSERT INTO settings (key, value) VALUES ('allowNewTeams', 'false');
    INSERT INTO settings (key, value) VALUES ('startTogetherMode', 'true');
    INSERT INTO settings (key, value) VALUES ('gameStarted', 'false');
    INSERT INTO settings (key, value) VALUES ('leaderboardFrozen', 'false');
  `);
  console.log('✅ Final Override database successfully reset.');
}

if (require.main === module) {
  resetDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Reset error:', err.message);
      process.exit(1);
    });
}

module.exports = { resetDatabase };
