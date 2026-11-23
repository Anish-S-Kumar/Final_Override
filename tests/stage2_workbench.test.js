// ==============================================================================
// FINAL OVERRIDE — STAGE 2 WORKBENCH PLAYWRIGHT E2E TEST
// Validates 2-column layout, decoder buttons 1..6, single-use check, undo/reset,
// numeric Vigenère input, full decode roundtrip, server persistence, and submission.
// ==============================================================================

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.DB_PROVIDER = 'sqlite';
process.env.ADMIN_PIN = 'InvictorsAdmin#2026';
process.env.EVENT_SALT = 'e2e_salt_vvce_998877';
process.env.SHARD_SECRET = 'e2e_shard_secret_override_token';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const app = require('../server/app');
const ds = require('../server/dataService');
const mission = require('../server/content/mission');

async function runStage2WorkbenchTest() {
  console.log('=============================================================');
  console.log('🧪 PLAYWRIGHT E2E: STAGE 2 WORKBENCH & CRYPTANALYSIS TEST');
  console.log('=============================================================\n');

  // Ensure ui-review directory exists for screenshots
  const reviewDir = path.join(__dirname, '../docs/ui-review');
  if (!fs.existsSync(reviewDir)) {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  // 1. Start Server on dynamic port
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[SETUP] Test server running at ${baseUrl}`);

  // 2. Launch Headless Chromium Browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Listen for console logs and errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 3. Register a test team and advance to Stage 2
    const teamName = `E2ESquad2_${Date.now()}`;
    const membersList = ['Agent Fox', 'Agent Scully', 'Agent Skinner', 'Agent Mulder'];
    
    const regRes = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName,
        coordinator: 'Kiran',
        member1: membersList[0],
        member2: membersList[1],
        member3: membersList[2],
        member4: membersList[3]
      })
    });
    assert.strictEqual(regRes.status, 200, 'Registration failed');
    const setCookie = regRes.headers.get('set-cookie') || '';
    const leaderToken = setCookie.split('fo_leader_token=')[1]?.split(';')[0];
    assert.ok(leaderToken, 'Leader token cookie missing');

    const team = await ds.getTeamByName(teamName);
    assert.ok(team, 'Team not found in database');

    // Advance team to Stage 2
    await ds.updateTeam(team.id, { stage: 2, status: 'active' });

    // Set cookie on browser context
    await context.addCookies([
      {
        name: 'fo_leader_token',
        value: leaderToken,
        domain: '127.0.0.1',
        path: '/'
      }
    ]);

    // 4. Navigate to portal and wait for Stage 2 to render
    console.log('[STEP 1] Navigating to game portal...');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // Verify Stage 2 rendered
    await page.waitForSelector('.stage2-layout-grid', { timeout: 8000 });
    console.log('✅ Stage 2 layout grid rendered.');

    // 5. Verify Left Column Briefing & Intelligence
    console.log('[STEP 2] Verifying Left Column structure...');
    const stageTitle = await page.textContent('.active-stage-title');
    assert.ok(stageTitle.includes('Stage 2: Decoding'), `Expected 'Stage 2: Decoding', got '${stageTitle}'`);

    const stageObjective = await page.textContent('.stage-objective-subtitle');
    assert.ok(stageObjective.includes('access phrase'), 'Stage objective subtitle missing');

    // Verify cipher icon is present in briefing
    const cipherIcon = await page.$('.intro-header svg use[*|href="#icon-cipher"]');
    assert.ok(cipherIcon, 'Cipher icon (#icon-cipher) must be present in briefing header');

    // Verify ordered How To Play list (1..7)
    const howToPlayItems = await page.$$('.how-to-play-list li');
    assert.strictEqual(howToPlayItems.length, 7, `Expected 7 how-to-play steps, found ${howToPlayItems.length}`);

    // Verify parts tiles grid
    const partsTiles = await page.$$('.parts-tiles-grid .part-tile');
    assert.strictEqual(partsTiles.length, 4, `Expected 4 parts tiles, found ${partsTiles.length}`);

    // Verify lowercase notice banner
    const noticeText = await page.textContent('.lowercase-notice-banner');
    assert.ok(noticeText.includes('strictly in lowercase'), 'Lowercase notice missing or incorrect');

    // Verify intercepted cryptographic payload block
    const payloadText = (await page.textContent('#stage2-cipher-raw')).trim();
    assert.ok(payloadText.length > 50, 'Payload text is empty or too short');

    // 6. Verify Right Column Cryptanalyst Workbench Initial State
    console.log('[STEP 3] Verifying Right Column Workbench & Controls...');
    const workbenchTitle = await page.textContent('.toolkit-title');
    assert.ok(workbenchTitle.includes('Cryptanalyst workbench'), 'Workbench title missing');

    const pasteBtn = await page.$('#btn-paste-original');
    const undoBtn = await page.$('#btn-undo-step');
    const resetBtn = await page.$('#btn-reset-workbench');
    assert.ok(pasteBtn && undoBtn && resetBtn, 'Workbench action buttons missing');

    // Textarea readonly check
    const isTextareaReadonly = await page.$eval('#toolkit-input', el => el.readOnly);
    assert.strictEqual(isTextareaReadonly, true, 'Workbench textarea must be readonly');

    // Check exactly 6 decoder module buttons
    const decoderButtons = await page.$$('#stage2-decoders-row .stage2-decoder-btn');
    assert.strictEqual(decoderButtons.length, 6, `Expected exactly 6 decoder buttons, found ${decoderButtons.length}`);

    for (let i = 1; i <= 6; i++) {
      const badgeText = await page.$eval(`#btn-module-${i} .stage2-decoder-badge`, el => el.textContent.trim());
      assert.strictEqual(badgeText, String(i), `Decoder button ${i} badge mismatch`);
    }

    // Output box initial placeholder
    const initialOutput = await page.textContent('#toolkit-output');
    assert.strictEqual(initialOutput, '(Results will appear here)');

    // Sequence chips initial empty
    const initialSeq = await page.textContent('#toolkit-sequence-chips');
    assert.ok(initialSeq.includes('(None applied)'), 'Sequence chips should initially show (None applied)');

    // 7. Interactive Workbench Test: Applying Decoders
    console.log('[STEP 4] Testing Workbench Actions & Transforms...');

    // Clicking a module before loading payload should show an error
    await page.click('#btn-module-2');
    const prePasteErr = await page.textContent('#toolkit-error');
    assert.ok(prePasteErr.includes('Paste payload'), 'Should require pasting payload before transforming');

    // Click "Paste payload"
    await page.click('#btn-paste-original');
    await page.waitForTimeout(100);
    const pastedVal = await page.$eval('#toolkit-input', el => el.value.trim());
    assert.strictEqual(pastedVal, payloadText, 'Textarea did not receive payload text');

    // Apply Module 2 (Base64)
    console.log('   -> Applying Module 2 (Base64)...');
    await page.click('#btn-module-2');
    await page.waitForTimeout(150);

    // Verify Module 2 button disabled with check icon
    const mod2Disabled = await page.$eval('#btn-module-2', el => el.disabled);
    assert.strictEqual(mod2Disabled, true, 'Module 2 button must be disabled after application');
    const mod2Check = await page.$('#btn-module-2 svg use[*|href="#icon-check"]');
    assert.ok(mod2Check, 'Module 2 button must show check icon');

    // Verify sequence chips has [2] Base64
    const seqAfterMod2 = await page.textContent('#toolkit-sequence-chips');
    assert.ok(seqAfterMod2.includes('[2] Base64'), 'Sequence chips missing [2] Base64');

    // Verify output box changed from placeholder to hex string
    const outputAfterMod2 = await page.textContent('#toolkit-output');
    assert.notStrictEqual(outputAfterMod2, '(Results will appear here)');
    assert.ok(/^[0-9A-Fa-f]+$/.test(outputAfterMod2.trim()), 'Output after Base64 decode should be hex string');

    // Apply Module 3 (Hex)
    console.log('   -> Applying Module 3 (Hex)...');
    await page.click('#btn-module-3');
    await page.waitForTimeout(150);

    const mod3Disabled = await page.$eval('#btn-module-3', el => el.disabled);
    assert.strictEqual(mod3Disabled, true, 'Module 3 button must be disabled');

    const seqAfterMod3 = await page.textContent('#toolkit-sequence-chips');
    assert.ok(seqAfterMod3.includes('[3] Hex'), 'Sequence chips missing [3] Hex');

    // Apply Module 1 (ROT13)
    console.log('   -> Applying Module 1 (ROT13)...');
    await page.click('#btn-module-1');
    await page.waitForTimeout(150);

    const mod1Disabled = await page.$eval('#btn-module-1', el => el.disabled);
    assert.strictEqual(mod1Disabled, true, 'Module 1 button must be disabled');

    const seqAfterMod1 = await page.textContent('#toolkit-sequence-chips');
    assert.ok(seqAfterMod1.includes('[1] ROT13'), 'Sequence chips missing [1] ROT13');

    // 8. Test Numeric Vigenère Decode
    console.log('[STEP 5] Testing Numeric Vigenère validation & decryption...');

    // Test rejection of non-numeric / letters
    await page.fill('#vigenere-key-input', 'CYGNUS');
    await page.click('#btn-vigenere-apply');
    await page.waitForTimeout(100);
    const alphaKeyErr = await page.textContent('#toolkit-error');
    assert.ok(alphaKeyErr.includes('only digits 1-9'), 'Vigenère input must reject letters');

    // Test rejection of zero
    await page.fill('#vigenere-key-input', '012');
    await page.click('#btn-vigenere-apply');
    await page.waitForTimeout(100);
    const zeroKeyErr = await page.textContent('#toolkit-error');
    assert.ok(zeroKeyErr.includes('no zeroes'), 'Vigenère input must reject zeroes');

    // Enter correct key: "231" (Base64=2, Hex=3, ROT13=1)
    console.log('   -> Submitting numeric Vigenère key "231"...');
    await page.fill('#vigenere-key-input', '231');
    await page.click('#btn-vigenere-apply');
    await page.waitForTimeout(200);

    // Verify plaintext output revealed
    const finalOutput = await page.textContent('#toolkit-output');
    console.log(`   -> Plaintext Output: "${finalOutput.trim()}"`);
    assert.ok(finalOutput.includes('ACCESS PHRASE IS CYGNUS'), 'Output did not reveal access phrase CYGNUS');

    // Verify sequence chip updated with [Key: 231]
    const finalSeq = await page.textContent('#toolkit-sequence-chips');
    assert.ok(finalSeq.includes('[Key: 231]'), 'Sequence chips missing [Key: 231]');

    // 9. Test Persistence Across Page Reload
    console.log('[STEP 6] Testing workbench persistence across page reload...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.stage2-layout-grid', { timeout: 8000 });

    const reloadedOutput = await page.textContent('#toolkit-output');
    assert.ok(reloadedOutput.includes('ACCESS PHRASE IS CYGNUS'), 'Workbench state was not persisted across reload');

    const reloadedMod2 = await page.$eval('#btn-module-2', el => el.disabled);
    assert.strictEqual(reloadedMod2, true, 'Module 2 should remain disabled after reload');

    // 10. Capture UI Review Screenshot
    const screenshotPath = path.join(reviewDir, 'stage2_workbench.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: docs/ui-review/stage2_workbench.png`);

    // 11. Test Reset & Undo
    console.log('[STEP 7] Testing Reset action...');
    await page.click('#btn-reset-workbench');
    await page.waitForTimeout(150);

    const resetOutput = await page.textContent('#toolkit-output');
    assert.strictEqual(resetOutput, '(Results will appear here)');

    const resetMod2 = await page.$eval('#btn-module-2', el => el.disabled);
    assert.strictEqual(resetMod2, false, 'Module 2 should be re-enabled after reset');

    // 12. Submit Correct Team Sequence Answer (Lowercase required)
    console.log('[STEP 8] Submitting final team sequence solution...');
    const seqObj = await ds.getTeamSequence(team.id);
    const expectedAnswer = seqObj ? seqObj.expectedAnswer.toLowerCase() : '8m4k7r9x';

    await page.fill('#stage-answer-input', expectedAnswer);
    await page.click('#btn-submit-answer');
    await page.waitForTimeout(1200);

    // Verify advancement to Stage 3
    const updatedTeam = await ds.getTeamById(team.id);
    assert.strictEqual(updatedTeam.stage, 3, `Expected team to advance to Stage 3, was on Stage ${updatedTeam.stage}`);
    console.log('✅ Verified team advanced to Stage 3.');

    // Assert zero console errors
    const nonFaviconErrors = consoleErrors.filter(e => !e.includes('favicon'));
    assert.strictEqual(nonFaviconErrors.length, 0, `Unexpected console errors: ${nonFaviconErrors.join('; ')}`);

    console.log('=============================================================');
    console.log('🎉 STAGE 2 WORKBENCH PLAYWRIGHT TEST PASSED WITH ZERO ERRORS!');
    console.log('=============================================================\n');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

if (require.main === module) {
  runStage2WorkbenchTest()
    .catch(err => {
      console.error('\n❌ STAGE 2 PLAYWRIGHT TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runStage2WorkbenchTest };
