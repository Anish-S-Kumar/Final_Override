// FINAL OVERRIDE — Stage 1 Canonical Morse Chart Service
// Single source of truth for the Stage 1 Morse table.
// Generates a deterministic per-team 26-letter chart of unique length 1–4 patterns.

const crypto = require('crypto');
const config = require('../../config');

const STAGE1_CHART_DOMAIN = 'stage1-chart';

// Canonical standard Morse patterns for all 26 letters (A–Z)
// Length 1 (2), Length 2 (4), Length 3 (8), Length 4 (12) = 26 distinct patterns
const STANDARD_MORSE_TABLE = Object.freeze({
  A: '• —',
  B: '— • • •',
  C: '— • — •',
  D: '— • •',
  E: '•',
  F: '• • — •',
  G: '— — •',
  H: '• • • •',
  I: '• •',
  J: '• — — —',
  K: '— • —',
  L: '• — • •',
  M: '— —',
  N: '— •',
  O: '— — —',
  P: '• — — •',
  Q: '— — • —',
  R: '• — •',
  S: '• • •',
  T: '—',
  U: '• • —',
  V: '• • • —',
  W: '• — —',
  X: '— • • —',
  Y: '— • — —',
  Z: '— — • •'
});

const ALPHABET = Object.freeze('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
const ALL_STANDARD_PATTERNS = Object.freeze(ALPHABET.map(l => STANDARD_MORSE_TABLE[l]));

/**
 * Validates that a list of letters has exactly 26 distinct patterns of length 1 to 4.
 */
function validateChart(letters) {
  if (!Array.isArray(letters) || letters.length !== 26) {
    throw new Error(`Invalid Morse chart: expected 26 letters, got ${letters ? letters.length : 0}`);
  }
  const seenLetters = new Set();
  const seenPatterns = new Set();

  for (const item of letters) {
    if (!item.letter || !ALPHABET.includes(item.letter)) {
      throw new Error(`Invalid letter in Morse chart: ${item.letter}`);
    }
    if (seenLetters.has(item.letter)) {
      throw new Error(`Duplicate letter in Morse chart: ${item.letter}`);
    }
    seenLetters.add(item.letter);

    const pattern = item.pattern || item.code;
    if (!pattern || typeof pattern !== 'string') {
      throw new Error(`Missing pattern for letter ${item.letter}`);
    }
    const symbols = pattern.trim().split(/\s+/);
    if (symbols.length < 1 || symbols.length > 4) {
      throw new Error(`Invalid pattern length for letter ${item.letter}: "${pattern}" (must be 1–4 symbols)`);
    }
    for (const sym of symbols) {
      if (sym !== '•' && sym !== '—') {
        throw new Error(`Invalid symbol in pattern for letter ${item.letter}: "${sym}"`);
      }
    }
    if (seenPatterns.has(pattern)) {
      throw new Error(`Duplicate pattern in Morse chart: "${pattern}" shared by multiple letters`);
    }
    seenPatterns.add(pattern);
  }
  return true;
}

/**
 * Generates or retrieves the canonical 26-letter Morse chart for a team.
 * Stable across requests, reloads, devices, and restarts.
 *
 * @param {Object|string} team - Team object with seed, or raw seed string.
 * @returns {{ letters: Array<{ letter: string, pattern: string, code: string }> }}
 */
function chartForTeam(team) {
  let mode = 'mapping';
  try {
    const mission = require('../../content/mission.json');
    if (mission?.stage1?.chart?.randomise === 'none') {
      mode = 'none';
    }
  } catch (_) {}

  // Mode "none": build the standard Morse table
  if (mode === 'none') {
    const standardLetters = ALPHABET.map(letter => ({
      letter,
      pattern: STANDARD_MORSE_TABLE[letter],
      code: STANDARD_MORSE_TABLE[letter]
    }));
    validateChart(standardLetters);
    return { letters: standardLetters };
  }

  // Mode "mapping": deterministic per-team Fisher-Yates shuffle
  const seed = (typeof team === 'object' && team !== null)
    ? (team.seed || team.id || team.name || 'default_stage1_seed')
    : String(team || 'default_stage1_seed');

  const salt = process.env.EVENT_SALT || 'final_override_salt_stage1';

  // Domain-separated HMAC-SHA256 PRNG
  const hmac = crypto.createHmac('sha256', salt);
  hmac.update(`${seed}:${STAGE1_CHART_DOMAIN}`);
  let buf = hmac.digest();

  // Extend buffer for ample random bytes
  const hmacExt = crypto.createHmac('sha256', salt);
  hmacExt.update(`${seed}:${STAGE1_CHART_DOMAIN}:ext`);
  buf = Buffer.concat([buf, hmacExt.digest()]);

  const shuffled = [...ALL_STANDARD_PATTERNS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const byte = buf[i];
    const j = byte % (i + 1);
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  // Map to A–Z in strict alphabetical order
  const letters = ALPHABET.map((letter, idx) => ({
    letter,
    pattern: shuffled[idx],
    code: shuffled[idx]
  }));

  validateChart(letters);
  return { letters };
}

// Initial self-validation at module load
validateChart(ALL_STANDARD_PATTERNS.map((p, idx) => ({ letter: ALPHABET[idx], pattern: p })));

module.exports = {
  STAGE1_CHART_DOMAIN,
  STANDARD_MORSE_TABLE,
  ALPHABET,
  validateChart,
  chartForTeam
};
