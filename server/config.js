const dotenv = require('dotenv');
const crypto = require('crypto');
const { execSync } = require('child_process');
dotenv.config();

function checkEnvGitStatus() {
  if (process.env.SKIP_GIT_ENV_CHECK === 'true' || process.env.NODE_ENV === 'test') return;
  try {
    const tracked = execSync('git ls-files .env', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (tracked) {
      const msg = '🚨 CRITICAL SECURITY ALERT: .env is tracked in git index! Run "git rm --cached .env" immediately.';
      console.error(msg);
      if (process.env.NODE_ENV === 'production') {
        throw new Error(msg);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('CRITICAL SECURITY ALERT')) throw err;
  }
}

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCoordinatorsAndPins(env = process.env) {
  const coordStr = env.COORDINATORS || '';
  const pinsStr = env.COORDINATOR_PINS || '';

  const coordinators = coordStr.split(',').map(c => c.trim()).filter(Boolean);
  const pins = pinsStr.split(',').map(p => p.trim()).filter(Boolean);

  const pinsMap = {};
  for (let i = 0; i < coordinators.length; i++) {
    const nameKey = coordinators[i].toLowerCase();
    pinsMap[nameKey] = pins[i] || '';
  }

  return { coordinators, pins, pinsMap };
}

function validateConfig(env = process.env) {
  const errors = [];

  const adminPin = env.ADMIN_PIN;
  const prohibitedPins = ['invictors', 'invictors@23', 'invictors2026', 'admin', 'password', '12345678'];
  if (!adminPin) {
    errors.push('ADMIN_PIN is required in environment configuration.');
  } else if (prohibitedPins.includes(adminPin.trim().toLowerCase())) {
    errors.push('ADMIN_PIN cannot be an insecure default (e.g. INVICTORS, INVICTORS@23).');
  } else if (adminPin.trim().length < 8) {
    errors.push('ADMIN_PIN must be at least 8 characters long.');
  }

  const salt = env.EVENT_SALT;
  if (!salt) {
    errors.push('EVENT_SALT is required in environment configuration.');
  } else if (salt === 'invictors_final_override_salt_2026') {
    errors.push("EVENT_SALT cannot be the insecure default 'invictors_final_override_salt_2026'.");
  } else if (salt.trim().length < 16) {
    errors.push('EVENT_SALT must be at least 16 characters long.');
  }

  const shardSecret = env.SHARD_SECRET;
  if (!shardSecret || shardSecret.trim().length === 0) {
    errors.push('SHARD_SECRET is required in environment configuration.');
  }

  const coordStr = env.COORDINATORS || '';
  const pinsStr = env.COORDINATOR_PINS || '';
  const coords = coordStr.split(',').map(c => c.trim()).filter(Boolean);
  const pins = pinsStr.split(',').map(p => p.trim()).filter(Boolean);

  if (coords.length > 0 || pins.length > 0) {
    if (coords.length !== pins.length) {
      errors.push(`COORDINATORS count (${coords.length}) does not match COORDINATOR_PINS count (${pins.length}). Each coordinator must have exactly one corresponding PIN.`);
    }
    pins.forEach((pin, idx) => {
      if (pin.length < 6) {
        errors.push(`Coordinator PIN for '${coords[idx]}' is too short (${pin.length} chars). PINs must be at least 6 characters.`);
      }
    });
  }

  if (errors.length > 0) {
    const msg = [
      '====================================================================',
      '🚨 FATAL SERVER STARTUP CONFIGURATION ERROR(S):',
      ...errors.map(e => `  - ${e}`),
      '===================================================================='
    ].join('\n');

    if (process.env.NODE_ENV !== 'test') {
      console.error(msg);
      process.exit(1);
    } else {
      const err = new Error(msg);
      err.validationErrors = errors;
      throw err;
    }
  }
}

// Perform validation on startup unless explicitly skipped in a test helper
checkEnvGitStatus();
if (process.env.NODE_ENV !== 'test' && process.env.SKIP_CONFIG_VALIDATION !== 'true') {
  validateConfig(process.env);
}

const { coordinators, pinsMap } = parseCoordinatorsAndPins(process.env);

// Canonical Supabase environment variables with aliases
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const databaseUrl = process.env.DATABASE_URL || '';

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    url,
    secretKey,
    isConfigured: Boolean(url && secretKey)
  };
}

module.exports = {
  getSupabaseConfig,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DB_PROVIDER: (process.env.DB_PROVIDER || (supabaseUrl && supabaseSecretKey ? 'supabase' : 'sqlite')).toLowerCase(),
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SECRET_KEY: supabaseSecretKey,
  DATABASE_URL: databaseUrl,
  ADMIN_PIN: process.env.ADMIN_PIN || '',
  COORDINATORS: coordinators,
  COORDINATOR_PINS: pinsMap,
  verifyCoordinatorPin(name, pin) {
    if (!name || !pin) return false;
    const expected = pinsMap[name.trim().toLowerCase()];
    if (!expected) return false;
    return timingSafeCompare(String(expected), String(pin));
  },
  timingSafeCompare,
  validateConfig,
  checkEnvGitStatus,
  ADMIN_SESSION_LIMIT: parseInt(process.env.ADMIN_SESSION_LIMIT, 10) || 2,
  TIME_CAP_MINUTES: parseInt(process.env.TIME_CAP_MINUTES, 10) || 90,
  TIME_CAP_ENFORCED: process.env.TIME_CAP_ENFORCED !== 'false',
  TAB_PENALTY_MINUTES: parseInt(process.env.TAB_PENALTY_MINUTES, 10) || 1,
  TAB_PENALTY_ENABLED: process.env.TAB_PENALTY_ENABLED !== 'false',
  EVENT_SALT: process.env.EVENT_SALT || '',
  SHARD_SECRET: process.env.SHARD_SECRET || '',
  ALLOW_NEW_TEAMS: process.env.ALLOW_NEW_TEAMS === 'true',
  MIN_TEAM_SIZE: parseInt(process.env.MIN_TEAM_SIZE, 10) || 3,
  MAX_TEAM_SIZE: parseInt(process.env.MAX_TEAM_SIZE, 10) || 4,
  WARDEN_MODE: (process.env.WARDEN_MODE || 'rules').toLowerCase(),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
};
