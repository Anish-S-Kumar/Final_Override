// FINAL OVERRIDE — Stage 5 Override Derivation
// Replaces old Stage 6 finalKey. Consolidates multi-device team sync and final authorization.
const { computeTeamCode } = require('./shard');

/**
 * Compute the final override key from the 4 team member shards.
 * @param {string} teamName
 * @param {Array} members
 * @returns {string} Override key (e.g. "SHARD1-SHARD2-SHARD3-SHARD4")
 */
function computeStage5Override(teamName, members) {
  return computeTeamCode(teamName, members);
}

module.exports = {
  computeStage5Override
};
