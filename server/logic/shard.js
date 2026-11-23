// FINAL OVERRIDE — HMAC Shard Generator
// Requirements: 3 or 4 players per team; code formats assigned via mission.mixedCountBySize
const crypto = require('crypto');
const { norm } = require('./security');
const config = require('../config');
let mission = null;
try {
  mission = require('../content/mission');
} catch {}

/**
 * Generate an HMAC shard for a team member.
 * @param {string} teamName
 * @param {string} memberName
 * @param {'mixed'|'alpha'} codeType
 * @returns {string} 3-character shard code
 */
function getMemberShard(teamName, memberName, codeType = 'mixed') {
  const secret = config.SHARD_SECRET || 'fallback_shard_secret_for_tests';
  const input = `FO|${norm(teamName)}|${norm(memberName)}|${codeType}`;
  const hmac = crypto.createHmac('sha256', secret).update(input).digest('hex');

  if (codeType === 'alpha') {
    // Generate strictly alphabetic characters (A-Z)
    let letters = '';
    for (let i = 0; i < hmac.length && letters.length < 3; i++) {
      const byte = parseInt(hmac.substr(i * 2, 2) || '0', 16);
      letters += String.fromCharCode(65 + (byte % 26));
    }
    return letters.toUpperCase();
  }

  // Mixed alphanumeric: ensure both a digit and a letter are present
  const raw = hmac.slice(0, 3).toUpperCase();
  if (/[0-9]/.test(raw) && /[A-Z]/.test(raw)) {
    return raw;
  }
  // Deterministic fallback: 1 digit + 2 uppercase letters
  const d = parseInt(hmac.slice(0, 2), 16) % 10;
  const l1 = String.fromCharCode(65 + (parseInt(hmac.slice(2, 4), 16) % 26));
  const l2 = String.fromCharCode(65 + (parseInt(hmac.slice(4, 6), 16) % 26));
  return `${d}${l1}${l2}`;
}

/**
 * Assign code types to members based on team size and mission config.
 * 4 players: 2 mixed, 2 alpha
 * 3 players: 2 mixed, 1 alpha
 * Uses per-team seeded choice if seed is provided.
 */
function assignMemberCodeTypes(members, seed) {
  const count = members.length;
  const mixedRule = (mission && mission.mixedCountBySize) || { 3: 2, 4: 2 };
  const targetMixed = mixedRule[String(count)] !== undefined ? mixedRule[String(count)] : 2;

  const mixedIndices = new Set();
  if (seed && typeof seed === 'string') {
    const hash = crypto.createHash('sha256').update(seed).digest();
    const available = members.map((_, idx) => idx);
    for (let i = 0; i < targetMixed && available.length > 0; i++) {
      const pickIdx = hash[i % hash.length] % available.length;
      mixedIndices.add(available[pickIdx]);
      available.splice(pickIdx, 1);
    }
  } else {
    for (let i = 0; i < count; i++) {
      if (mixedIndices.size < targetMixed && (i % 2 === 0 || count - i <= targetMixed - mixedIndices.size)) {
        mixedIndices.add(i);
      }
    }
  }

  return members.map((m, idx) => ({
    ...m,
    codeType: mixedIndices.has(idx) ? 'mixed' : 'alpha'
  }));
}

/**
 * Compute the full composite team code for Stage 5.
 */
function computeTeamCode(teamName, members) {
  const shards = members.map((m, idx) => {
    if (typeof m === 'string') {
      const type = (idx % 2 === 0) ? 'mixed' : 'alpha';
      return getMemberShard(teamName, m, type);
    }
    const type = m.codeType || ((idx % 2 === 0) ? 'mixed' : 'alpha');
    return m.assignedCode || getMemberShard(teamName, m.fullName, type);
  });
  return shards.join('-');
}

module.exports = {
  getMemberShard,
  assignMemberCodeTypes,
  computeTeamCode
};
