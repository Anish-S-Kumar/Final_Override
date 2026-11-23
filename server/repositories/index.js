// FINAL OVERRIDE — Repository Provider Dispatcher
// Selects the storage implementation based on DB_PROVIDER and environment configuration.
// Defaults to local high-performance SQLite engine.

const { getSupabaseConfig } = require('../config');

const provider = (process.env.DB_PROVIDER || process.env.DATA_SOURCE || 'sqlite').toLowerCase();
let repository;

switch (provider) {
  case 'sqlite': {
    repository = require('./sqliteRepository');
    break;
  }
  case 'supabase': {
    const SupabaseRepository = require('./supabaseRepository');
    repository = new SupabaseRepository();
    break;
  }
  case 'firebase': {
    const FirebaseStub = require('./firebaseStub');
    repository = new FirebaseStub();
    break;
  }
  default: {
    const sbConfig = getSupabaseConfig();
    if (sbConfig.isConfigured && process.env.ENABLE_SUPABASE_ADAPTER === 'true') {
      const SupabaseRepository = require('./supabaseRepository');
      repository = new SupabaseRepository();
    } else {
      repository = require('./sqliteRepository');
    }
    break;
  }
}

module.exports = repository;
