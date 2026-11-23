#!/usr/bin/env node
// ==============================================================================
// FINAL OVERRIDE — STAGE 2 CIPHER BUILDER & VALIDATOR
// Generates the multi-layer encrypted payload with numeric Vigenère inner cipher
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const decoders = require('../public/js/stages/stage2/decoders');

const MODULES = [
  { id: 'rot13', index: 1, label: 'ROT13', type: 'letter-sub' },
  { id: 'base64', index: 2, label: 'Base64', type: 'encoding' },
  { id: 'hex', index: 3, label: 'Hex', type: 'encoding' },
  { id: 'atbash', index: 4, label: 'Atbash', type: 'letter-sub' },
  { id: 'reverse', index: 5, label: 'Reverse', type: 'transposition' },
  { id: 'caesar', index: 6, label: 'Caesar (shift 3)', type: 'letter-sub', shift: 3 }
];

const LAYERS = ['base64', 'hex', 'rot13'];
const PLAINTEXT = 'ACCESS PHRASE IS CYGNUS. ASSEMBLE YOUR TEAM SEQUENCE IN LOWERCASE.';
const ACCESS_PHRASE = 'CYGNUS';

const HOW_TO_PLAY = [
  'Copy or paste the intercepted payload into the workbench input.',
  'Inspect the character set to identify which encoding was applied last.',
  'Apply that decoder by clicking its numbered button (each can be used once).',
  'Repeat for each layer until you reveal readable English that looks scrambled by a substitution cipher.',
  'Take the sequence of decoder numbers you used, in the exact order you clicked them (for example 2, 3, 1 becomes 231).',
  'Enter that number sequence into the Vigenère key input and click \'Decode with key\'.',
  'Read the access phrase, then assemble your team\'s assigned part numbers in the exact order shown on the left.'
];

function buildCipher() {
  console.log('Building Stage 2 multi-layer cipher...');

  // 1. Derive key from layers
  const modMap = new Map(MODULES.map(m => [m.id, m]));
  const keyDigits = LAYERS.map(layerId => {
    const mod = modMap.get(layerId);
    assert(mod, `Layer ${layerId} not found in modules`);
    return String(mod.index);
  }).join('');

  console.log(`- Layers (decode order): ${LAYERS.join(' -> ')}`);
  console.log(`- Derived Vigenère key: ${keyDigits}`);
  assert.strictEqual(keyDigits, '231', 'Vigenère key must be 231 based on modules [base64:2, hex:3, rot13:1]');

  // 2. Encryption Pipeline (Inverse of decode: Vigenère -> ROT13 -> Hex -> Base64)
  // Step 1: Numeric Vigenère encrypt
  const vigRes = decoders.vigenereNumericEncode(PLAINTEXT, keyDigits);
  assert(vigRes.ok, 'Vigenère encoding failed: ' + vigRes.reason);
  const vigText = vigRes.text;

  // Step 2: ROT13 encrypt
  const rotRes = decoders.rot13(vigText);
  assert(rotRes.ok, 'ROT13 encoding failed');
  const rotText = rotRes.text;

  // Step 3: Hex encode (ASCII characters to uppercase hex bytes)
  let hexText = '';
  for (let i = 0; i < rotText.length; i++) {
    const hexByte = rotText.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase();
    hexText += hexByte;
  }

  // Step 4: Base64 encode
  const base64Text = Buffer.from(hexText, 'utf8').toString('base64');

  console.log(`- Encrypted Base64 Payload Length: ${base64Text.length}`);

  // 3. Decryption Verification Pipeline
  // Decode Step 1: Base64
  const decB64 = decoders.base64Decode(base64Text);
  assert(decB64.ok, 'Decode Step 1 (Base64) failed: ' + decB64.reason);
  assert.strictEqual(decB64.text, hexText, 'Base64 decoded must match hexText');

  // Decode Step 2: Hex
  const decHex = decoders.hexDecode(decB64.text);
  assert(decHex.ok, 'Decode Step 2 (Hex) failed: ' + decHex.reason);
  assert.strictEqual(decHex.text, rotText, 'Hex decoded must match rotText');

  // Decode Step 3: ROT13
  const decRot = decoders.rot13(decHex.text);
  assert(decRot.ok, 'Decode Step 3 (ROT13) failed');
  assert.strictEqual(decRot.text, vigText, 'ROT13 decoded must match vigText');

  // Decode Step 4: Numeric Vigenère
  const decVig = decoders.vigenereNumericDecode(decRot.text, keyDigits);
  assert(decVig.ok, 'Decode Step 4 (Vigenère) failed: ' + decVig.reason);
  assert.strictEqual(decVig.text, PLAINTEXT, 'Fully decoded text must match original plaintext exactly');

  // 4. Negative Permutation Tests
  const wrongKeys = ['123', '321', '213', '111', '999', '23', '2312', '456'];
  for (const wk of wrongKeys) {
    const wrongDec = decoders.vigenereNumericDecode(decRot.text, wk);
    assert(wrongDec.ok, 'Wrong key decode returned error instead of scrambled text');
    assert.notStrictEqual(wrongDec.text, PLAINTEXT, `Wrong key ${wk} should not produce plaintext`);
    assert(!wrongDec.text.includes(ACCESS_PHRASE), `Wrong key ${wk} leaked access phrase`);
  }

  // Assert access phrase does not appear anywhere in raw encodedText
  assert(!base64Text.includes(ACCESS_PHRASE), 'Access phrase must not appear in Base64 ciphertext');
  assert(!hexText.includes(ACCESS_PHRASE), 'Access phrase must not appear in Hex ciphertext');

  console.log('✅ Roundtrip and negative tests passed with 100% cryptographic integrity.');

  return {
    encodedText: base64Text,
    keyDigits,
    modules: MODULES,
    layers: LAYERS,
    howToPlay: HOW_TO_PLAY,
    plaintextTemplate: PLAINTEXT,
    accessPhrase: ACCESS_PHRASE
  };
}

// Update mission.json and mission.example.json
function updateMissionFiles() {
  const result = buildCipher();
  const missionPath = path.join(__dirname, '..', 'server', 'content', 'mission.json');
  const examplePath = path.join(__dirname, '..', 'server', 'content', 'mission.example.json');

  for (const filePath of [missionPath, examplePath]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    content.stage2 = {
      ...content.stage2,
      title: 'Stage 2: Layered Cryptanalysis & Sequence Assembly',
      accessPhrase: result.accessPhrase,
      plaintext: result.plaintextTemplate,
      plaintextTemplate: result.plaintextTemplate,
      encodedText: result.encodedText,
      modules: result.modules,
      layers: result.layers,
      vigenere: {
        mode: 'module-index-sequence',
        maxLength: 12
      },
      howToPlay: result.howToPlay,
      hints: [
        'Inspect character sets to peel layers: Base64 uses [A-Za-z0-9+/=], Hex uses [0-9A-Fa-f], ROT13 preserves spacing and punctuation. The innermost cipher is numeric Vigenère.',
        'Peel the layers in order: Base64 -> Hex -> ROT13. Then read the decoder button index numbers in the exact order you clicked them to form your Vigenère key.'
      ]
    };

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

if (require.main === module) {
  updateMissionFiles();
}

module.exports = { buildCipher, updateMissionFiles };
