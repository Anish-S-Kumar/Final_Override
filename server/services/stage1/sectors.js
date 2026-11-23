// FINAL OVERRIDE — Stage 1 Dynamic Sectors Service
// Pure function of (answer word, chartForTeam(team)).
// Produces sanitized sector definitions with zero answer leaks or trap text.

const {
  describePulses,
  describeBinary,
  describeBlinks,
  describeSatellite,
  patternToChips,
  patternToBinaryStream,
  patternToPulses
} = require('./describePattern');

/**
 * Builds the 4 sectors for a given chart and target answer word.
 *
 * @param {Object|Array} chart - Result of chartForTeam ({ letters }) or letters array.
 * @param {string} [answer='NOVA'] - The target 4-letter solution word.
 * @returns {Array<Object>} 4 sanitized sector definition objects.
 */
function generateStage1Sectors(chart, answer = 'NOVA') {
  const letters = Array.isArray(chart) ? chart : (chart?.letters || []);
  const patternMap = new Map();
  for (const item of letters) {
    patternMap.set(item.letter, item.pattern || item.code);
  }

  const targetChars = answer.toUpperCase().slice(0, 4).split('');

  // Sector 1: Pulse Signal
  const s1Char = targetChars[0] || 'N';
  const s1Pattern = patternMap.get(s1Char) || '— •';
  const sector1 = {
    id: 1,
    name: 'SECTOR 1',
    badge: 'PULSE SIGNAL',
    desc: describePulses(s1Pattern),
    chips: patternToChips(s1Pattern),
    morse: s1Pattern
  };

  // Sector 2: Binary Code
  const s2Char = targetChars[1] || 'O';
  const s2Pattern = patternMap.get(s2Char) || '— — —';
  const sector2 = {
    id: 2,
    name: 'SECTOR 2',
    badge: 'BINARY CODE',
    desc: describeBinary(s2Pattern),
    stream: patternToBinaryStream(s2Pattern),
    chips: patternToChips(s2Pattern),
    morse: s2Pattern
  };

  // Sector 3: Blinking Light (Optical Beacon)
  // CRITICAL SECURITY RULE (R2): Do NOT include `morse` or `trapAlert` in Sector 3!
  const s3Char = targetChars[2] || 'V';
  const s3Pattern = patternMap.get(s3Char) || '• • • —';
  const unitMs = 600;
  const leadInMs = 800;
  const sector3 = {
    id: 3,
    name: 'SECTOR 3',
    badge: 'BLINKING LIGHT',
    desc: describeBlinks(s3Pattern),
    buttonText: '▶ Watch Light Blink',
    unitMs,
    leadInMs,
    pulses: patternToPulses(s3Pattern, unitMs, leadInMs)
  };

  // Sector 4: Satellite Signal
  const s4Char = targetChars[3] || 'A';
  const s4Pattern = patternMap.get(s4Char) || '• —';
  const sector4 = {
    id: 4,
    name: 'SECTOR 4',
    badge: 'SATELLITE SIGNAL',
    desc: describeSatellite(s4Pattern),
    chips: patternToChips(s4Pattern),
    morse: s4Pattern
  };

  return [sector1, sector2, sector3, sector4];
}

module.exports = {
  generateStage1Sectors
};
