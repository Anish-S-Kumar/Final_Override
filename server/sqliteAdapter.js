let Database = null;

try {
  Database = require('better-sqlite3');
} catch (_) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    Database = function(filename) {
      const syncDb = new DatabaseSync(filename);
      return {
        exec(sql) {
          return syncDb.exec(sql);
        },
        pragma(pragmaStr) {
          try {
            syncDb.exec(`PRAGMA ${pragmaStr}`);
          } catch (_) {}
        },
        prepare(sql) {
          const stmt = syncDb.prepare(sql);
          return {
            run(...args) {
              const res = stmt.run(...args);
              return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
            },
            get(...args) {
              const res = stmt.get(...args);
              return res || undefined;
            },
            all(...args) {
              return stmt.all(...args) || [];
            }
          };
        },
        transaction(fn) {
          return (...args) => {
            syncDb.exec('BEGIN');
            try {
              const result = fn(...args);
              syncDb.exec('COMMIT');
              return result;
            } catch (err) {
              syncDb.exec('ROLLBACK');
              throw err;
            }
          };
        },
        close() {
          return syncDb.close();
        }
      };
    };
  } catch (err) {
    console.warn('Neither better-sqlite3 nor node:sqlite is available.');
  }
}

module.exports = Database;
