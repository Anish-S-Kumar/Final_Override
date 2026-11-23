// FINAL OVERRIDE — Stage 2 Deterministic Randomizer
// Derives per-team deterministic fragment presentation order and expected answer.
const crypto = require('crypto');
const mission = require('../content/mission');

function getBaseFragments() {
  if (mission.stage2 && Array.isArray(mission.stage2.fragments)) {
    return mission.stage2.fragments;
  }
  return [
    { id: 1, label: 'PART-1', code: '8M' },
    { id: 3, label: 'PART-3', code: '4K' },
    { id: 5, label: 'PART-5', code: '7R' },
    { id: 7, label: 'PART-7', code: '9X' }
  ];
}

function generateSequence(seed) {
  const fragments = getBaseFragments();
  const hash = crypto.createHash('sha256').update(String(seed)).digest();
  const shuffled = [...fragments];

  // Deterministic Fisher-Yates shuffle using SHA-256 seed digest
  for (let i = shuffled.length - 1; i > 0; i--) {
    const byte = hash[i % hash.length];
    const j = byte % (i + 1);
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  const fragmentOrder = shuffled.map(f => f.id);
  const upperAnswer = shuffled.map(f => f.code).join('');
  const expectedAnswer = upperAnswer.toLowerCase();

  return {
    fragmentOrder,
    shuffledFragments: shuffled,
    expectedAnswerUpper: upperAnswer,
    expectedAnswer
  };
}

module.exports = {
  getBaseFragments,
  generateSequence
};
