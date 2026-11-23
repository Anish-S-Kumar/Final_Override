// FINAL OVERRIDE — Master Final Key Derivation (Stage 6)
// Combines recovered fragments from stages 1 through 5 in deterministic order.

const { norm } = require('./security');

function reverseString(str) {
  return String(str).split('').reverse().join('');
}

/**
 * Computes the master system override key for Stage 6.
 * @param {string} f1 - Stage 1 fragment (NOVA)
 * @param {string} f2 - Stage 2 fragment (e.g. 8m4k7r9x)
 * @param {string} f3 - Stage 3 fragment (ZENITH)
 * @param {string} f4 - Stage 4 fragment (47K)
 * @param {string} f5 - Stage 5 team code (e.g. 9B1-DPY-VNZ-4E2 or BVD-3C4-9BM)
 * @returns {string} Master key in format FO{f4-f2-f1-rev(f3)-f5NoDashes}#sum
 */
function computeFinalKey(f1, f2, f3, f4, f5) {
  const f5NoDashes = String(f5 || '').replace(/-/g, '').toUpperCase();
  const body = [
    String(f4 || '47K').toUpperCase(),
    String(f2 || '8m4k7r9x').toLowerCase(),
    String(f1 || 'NOVA').toUpperCase(),
    reverseString(String(f3 || 'ZENITH').toUpperCase()),
    f5NoDashes
  ].join('-');

  let digitSum = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char >= '0' && char <= '9') {
      digitSum += parseInt(char, 10);
    }
  }

  const key = `FO{${body}}#${digitSum}`;
  return norm(key);
}

module.exports = {
  computeFinalKey,
  reverseString
};
