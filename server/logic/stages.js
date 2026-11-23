// FINAL OVERRIDE — Master 6-Stage Configuration
const assert = require('assert');
const mission = require('../content/mission');

// Startup assertions for Stage 2 config integrity
assert(Array.isArray(mission.stage2.modules) && mission.stage2.modules.length >= 6, 'Stage 2 modules must have >= 6 items');
const stage2Indexes = mission.stage2.modules.map(m => m.index);
const uniqueStage2Indexes = new Set(stage2Indexes);
assert.strictEqual(uniqueStage2Indexes.size, mission.stage2.modules.length, 'Stage 2 module indexes must be unique');
for (let i = 1; i <= mission.stage2.modules.length; i++) {
  assert(uniqueStage2Indexes.has(i), `Stage 2 module indexes must be consecutive 1..N (missing ${i})`);
}
const stage2ModIds = new Set(mission.stage2.modules.map(m => m.id));
for (const layer of (mission.stage2.layers || [])) {
  assert(stage2ModIds.has(layer), `Layer ${layer} must exist in Stage 2 modules`);
}
assert.strictEqual(mission.stage2.vigenere?.mode, 'module-index-sequence', 'Vigenere mode must be module-index-sequence');

const STAGE_CONFIG = {
  1: {
    name: mission.stageNames['1'],
    icon: 'signal',
    title: mission.stage1.title || 'Stage 1: Signal Intercept & Morse Matrix',
    answer: mission.stage1.answer,
    decoy: mission.stage1.decoy,
    memoriseSeconds: mission.stage1.memoriseSeconds || 300,
    memorise: mission.stage1.memorise,
    chart: mission.stage1.chart,
    intro: mission.stage1.intro,
    sectors: mission.stage1.sectors,
    policy: mission.stage1.policy,
    hints: mission.stage1.hints
  },
  2: {
    name: mission.stageNames['2'],
    icon: 'cipher',
    title: mission.stage2.title || 'Stage 2: Layered Cryptanalysis & Sequence Assembly',
    answer: mission.stage2.answer,
    accessPhrase: mission.stage2.accessPhrase,
    encodedText: mission.stage2.encodedText,
    fragments: mission.stage2.fragments,
    modules: mission.stage2.modules,
    howToPlay: mission.stage2.howToPlay,
    vigenere: mission.stage2.vigenere,
    plaintextTemplate: mission.stage2.plaintextTemplate,
    hints: mission.stage2.hints
  },
  3: {
    name: mission.stageNames['3'],
    icon: 'terminal',
    title: mission.stage3.title || 'Stage 3: Neural Warden Comms Protocol',
    answer: mission.stage3.realFragment,
    decoy: mission.stage3.decoyFragment,
    accessPhrase: mission.stage3.accessPhrase,
    hints: mission.stage3.hints
  },
  4: {
    name: mission.stageNames['4'],
    icon: 'flag',
    title: mission.stage4.title || 'Stage 4: Capture The Flag & Terminal Infiltration',
    answer: mission.stage4.answer,
    commentToken: mission.stage4.commentToken,
    tokens: mission.stage4.tokens,
    briefing: mission.stage4.briefing,
    hints: mission.stage4.hints
  },
  5: {
    name: mission.stageNames['5'],
    icon: 'users',
    title: mission.stage5.title || 'Stage 5: Team Sync & Multi-Device HMAC Link',
    hints: mission.stage5.hints
  },
  6: {
    name: mission.stageNames['6'],
    icon: 'shield',
    title: mission.stage6.title || 'Stage 6: Final Integration & Master Override',
    machineNames: mission.stage6.machineNames,
    hints: mission.stage6.hints
  }
};

module.exports = {
  STAGE_CONFIG,
  getStageDetails(stage) {
    return STAGE_CONFIG[stage] || null;
  }
};
