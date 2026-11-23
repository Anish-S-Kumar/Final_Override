#!/usr/bin/env node
// ==============================================================================
// FINAL OVERRIDE — MISSION CONTENT & ANSWER INTEGRITY CHECK
// Verifies cryptographic consistency and answer derivations across all 6 stages
// ==============================================================================

const assert = require('assert');
const mission = require('../server/content/mission');
const { STAGE_CONFIG } = require('../server/logic/stages');
const { computeFinalKey } = require('../server/logic/finalKey');
const { computeTeamCode, getMemberShard } = require('../server/logic/shard');
const { norm } = require('../server/logic/security');

function runContentCheck() {
  console.log('======================================================');
  console.log('RUNNING MISSION CONTENT & ANSWER INTEGRITY CHECKS');
  console.log('======================================================');

  // 1. Stage Count Verification
  const stageKeys = Object.keys(mission.stageNames);
  console.log(`\n1. Stage Count: ${stageKeys.length} stages declared`);
  assert.strictEqual(stageKeys.length, 6, 'Game must have exactly 6 canonical stages');
  assert.strictEqual(Object.keys(STAGE_CONFIG).length, 6, 'STAGE_CONFIG must define 6 stages');

  // 2. Stage 1 Verification
  console.log('2. Stage 1 (Signal Intercept & Morse Matrix):');
  const s1 = mission.stage1;
  assert.strictEqual(s1.answer, 'NOVA', 'Stage 1 answer must be NOVA');
  assert.strictEqual(s1.sectors.length, 4, 'Stage 1 must have 4 sectors');
  assert.strictEqual(s1.memoriseSeconds, 300, 'Stage 1 memoriseSeconds must be 300 (5 minutes)');

  const { generateStage1Chart, generateStage1Sectors } = require('../server/logic/stage1Randomizer');
  assert.strictEqual(generateStage1Chart('default_check').length, 26, 'Stage 1 chart must contain all 26 letters');
  const {
    patternToChips,
    patternToBinaryStream,
    patternToPulses,
    describePulses,
    describeBinary,
    describeBlinks,
    describeSatellite
  } = require('../server/services/stage1/describePattern');

  const seenCharts = new Set();
  for (let t = 0; t < 200; t++) {
    const seed = 'test_team_seed_' + t;
    const tChart = generateStage1Chart(seed);
    assert.strictEqual(tChart.length, 26, 'Chart must have 26 letters');

    // 26 unique patterns of length 1 to 4
    const patternSet = new Set(tChart.map(c => c.code.replace(/\s+/g, '')));
    assert.strictEqual(patternSet.size, 26, 'All 26 patterns in chart must be unique');
    for (const p of patternSet) {
      assert(p.length >= 1 && p.length <= 4, `Pattern ${p} must have length 1..4`);
    }

    const tSectors = generateStage1Sectors(tChart, 'NOVA');
    assert.strictEqual(tSectors.length, 4, 'Must generate 4 sectors');

    const chartMap = new Map(tChart.map(c => [c.letter, c.code]));

    // Check Sector 1 corresponds to N
    const sec1 = tSectors.find(s => s.id === 1);
    const patN = chartMap.get('N');
    assert.strictEqual(JSON.stringify(sec1.chips), JSON.stringify(patternToChips(patN)));
    assert.strictEqual(sec1.desc, describePulses(patN));

    // Check Sector 2 corresponds to O
    const sec2 = tSectors.find(s => s.id === 2);
    const patO = chartMap.get('O');
    assert.strictEqual(sec2.stream, patternToBinaryStream(patO));
    assert.strictEqual(sec2.desc, describeBinary(patO));

    // Check Sector 3 corresponds to V
    const sec3 = tSectors.find(s => s.id === 3);
    const patV = chartMap.get('V');
    assert.strictEqual(JSON.stringify(sec3.pulses), JSON.stringify(patternToPulses(patV, sec3.unitMs || 600)));
    assert.strictEqual(sec3.desc, describeBlinks(patV));
    assert.strictEqual(sec3.morse, undefined, 'Sector 3 must NOT contain morse property');
    assert.strictEqual(sec3.trapAlert, undefined, 'Sector 3 must NOT contain trapAlert');

    // Check Sector 4 corresponds to A
    const sec4 = tSectors.find(s => s.id === 4);
    const patA = chartMap.get('A');
    assert.strictEqual(JSON.stringify(sec4.chips), JSON.stringify(patternToChips(patA)));
    assert.strictEqual(sec4.desc, describeSatellite(patA));

    seenCharts.add(tChart.map(c => c.code).join(','));
  }
  assert.strictEqual(seenCharts.size, 200, 'All 200 teams must receive distinct Morse charts');
  console.log('  - Memorise Phase duration = 300s (5 minutes)');
  console.log('  - 26 letters present in reference table (A–Z)');
  console.log('  - 200 randomized teams tested: all decode to NOVA with 200 unique tables');

  const s3 = s1.sectors.find(s => s.id === 3);
  assert(s3, 'Sector 3 must exist');
  assert.strictEqual(s3.unitMs, 600, 'Sector 3 blinking light unitMs must be 600ms');
  console.log('  - Sector 1 = N (Pulses)');
  console.log('  - Sector 2 = O (Binary)');
  console.log('  - Sector 3 = V (Blinks, unitMs: 600ms)');
  console.log('  - Sector 4 = A (Satellite)');
  console.log('  - Assembled Key = NOVA (Verified)');

  // 3. Stage 2 Verification
  console.log('\n3. Stage 2 (Layered Cryptanalysis & Numeric Vigenère):');
  const s2 = mission.stage2;
  const decoders = require('../public/js/stages/stage2/decoders');

  assert(Array.isArray(s2.modules) && s2.modules.length >= 6, 'Stage 2 modules must have >= 6 items');
  assert(Array.isArray(s2.layers) && s2.layers.length === 3, 'Stage 2 must have 3 decode layers');
  assert.strictEqual(s2.vigenere?.mode, 'module-index-sequence', 'Vigenere mode must be module-index-sequence');

  const b64Res = decoders.base64Decode(s2.encodedText);
  assert(b64Res.ok, 'Base64 decode must succeed');
  const hexRes = decoders.hexDecode(b64Res.text);
  assert(hexRes.ok, 'Hex decode must succeed');
  const rotRes = decoders.rot13(hexRes.text);
  assert(rotRes.ok, 'ROT13 decode must succeed');

  const modMap = new Map(s2.modules.map(m => [m.id, m]));
  const derivedKey = s2.layers.map(lid => modMap.get(lid).index).join('');
  assert.strictEqual(derivedKey, '231', 'Derived key from layers must be 231');

  const vigRes = decoders.vigenereNumericDecode(rotRes.text, derivedKey);
  assert(vigRes.ok, 'Numeric Vigenere decode must succeed');
  assert(vigRes.text.includes(s2.accessPhrase), `Layered decryption must contain access phrase ${s2.accessPhrase}`);
  assert.strictEqual(s2.accessPhrase, 'CYGNUS', 'Stage 2 access phrase must be CYGNUS');
  assert.strictEqual(vigRes.text, s2.plaintextTemplate || s2.plaintext, 'Decrypted text must match plaintext template');
  console.log(`  - Encoded payload decodes through Base64 -> Hex -> ROT13 -> Vigenère(${derivedKey}) to: "${vigRes.text.slice(0, 35)}..."`);
  console.log('  - Access Phrase = CYGNUS (Verified)');

  // 4. Stage 3 Verification
  console.log('\n4. Stage 3 (Neural WARDEN Protocol):');
  const s3_content = mission.stage3;
  assert.strictEqual(s3_content.realFragment, 'ZENITH', 'Real fragment must be ZENITH');
  assert.strictEqual(s3_content.decoyFragment, 'DELTA7', 'Decoy fragment must be DELTA7');
  assert.strictEqual(s3_content.accessPhrase, 'CYGNUS', 'Access phrase must be CYGNUS');
  console.log('  - Real Fragment = ZENITH, Decoy = DELTA7, Phrase = CYGNUS (Verified)');

  // 5. Stage 4 Verification
  console.log('\n5. Stage 4 (Capture The Flag):');
  const s4 = mission.stage4;
  assert.strictEqual(s4.tokens.token1, '4', 'Token 1 must be 4');
  assert.strictEqual(s4.tokens.token2, '7', 'Token 2 must be 7');
  assert.strictEqual(s4.tokens.token3, 'K', 'Token 3 must be K');
  assert.strictEqual(s4.answer, '47K', 'Stage 4 answer must be 47K');
  console.log('  - Concatenation: 4 + 7 + K = 47K (Verified)');

  // 6. Stage 5 Verification (Team Sync)
  console.log('\n6. Stage 5 (Team Sync & Multi-Device HMAC Link):');
  const members4 = [
    { fullName: 'Alice', codeType: 'mixed' },
    { fullName: 'Bob', codeType: 'mixed' },
    { fullName: 'Charlie', codeType: 'alpha' },
    { fullName: 'Diana', codeType: 'alpha' }
  ];
  const code4 = computeTeamCode('Team Alpha', members4);
  assert.strictEqual(code4.split('-').length, 4, '4-member team code must have 4 shards');

  const members3 = [
    { fullName: 'Alice', codeType: 'mixed' },
    { fullName: 'Bob', codeType: 'mixed' },
    { fullName: 'Charlie', codeType: 'alpha' }
  ];
  const code3 = computeTeamCode('Team Beta', members3);
  assert.strictEqual(code3.split('-').length, 3, '3-member team code must have 3 shards');
  console.log(`  - 4-player team code sample: ${code4} (Verified)`);
  console.log(`  - 3-player team code sample: ${code3} (Verified)`);

  // 7. Stage 6 Verification (Final Integration & Master Override)
  console.log('\n7. Stage 6 (Final Integration & Master Override):');
  const finalKeySample = computeFinalKey('NOVA', '8m4k7r9x', 'ZENITH', '47K', code4);
  assert(finalKeySample.startsWith('fo{') || finalKeySample.startsWith('FO{'), 'Final key must have FO{} prefix');
  assert(finalKeySample.includes('#'), 'Final key must include #checksum');
  console.log(`  - Master Final Key sample: ${finalKeySample} (Verified)`);

  console.log('\n======================================================');
  console.log('🎉 ALL 6 STAGES PASS CONTENT INTEGRITY VERIFICATION!');
  console.log('======================================================\n');
}

if (require.main === module) {
  try {
    runContentCheck();
  } catch (err) {
    console.error('❌ Content check failed:', err.message);
    process.exit(1);
  }
}

module.exports = { runContentCheck };
