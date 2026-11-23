// FINAL OVERRIDE — Stage 1 Randomizer Compatibility Bridge
// Forwards directly to server/services/stage1/chart.js and sectors.js (Single Source of Truth)

const { chartForTeam } = require('../services/stage1/chart');
const { generateStage1Sectors } = require('../services/stage1/sectors');

function generateStage1Chart(seed) {
  const result = chartForTeam(seed);
  return result.letters;
}

module.exports = {
  chartForTeam,
  generateStage1Chart,
  generateStage1Sectors
};
