/**
 * Task 0: Complete Browser & Subsystem Diagnostics Suite (Playwright + Node)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Set test environment
const testDbPath = path.join(__dirname, 'test_diag.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

process.env.NODE_ENV = 'test';
process.env.DB_PROVIDER = 'sqlite';
process.env.DATA_SOURCE = 'sqlite';
process.env.DB_PATH = testDbPath;
process.env.ADMIN_PIN = 'InvictorsAdmin#2026';
process.env.EVENT_SALT = 'final_override_secure_salt_vvce_998877';
process.env.SHARD_SECRET = 'shard_secret_override_token_77665544';
process.env.COORDINATORS = 'Arun,Divya,Kiran,Pooja,Rakshith';
process.env.COORDINATOR_PINS = '112233,223344,334455,445566,556677';
process.env.TIME_CAP_ENFORCED = 'false';
process.env.ALLOW_NEW_TEAMS = 'true';

const app = require('../server/app');
const ds = require('../server/dataService');
const mission = require('../server/content/mission');

async function runDiagnostics() {
  console.log('======================================================');
  console.log('TASK 0 DIAGNOSTICS: PLAYWRIGHT & SUBSYSTEM AUDIT');
  console.log('======================================================\n');

  // Start test server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[SERVER] Test server running at ${baseUrl}`);

  // 1. Create a test team
  const teamId = 'team_diag_' + Date.now();
  const sessionToken = 'diag_token_' + Date.now();
  await ds.createTeam({
    team: {
      id: teamId,
      name: 'Diag Squad',
      coordinator: 'Arun',
      startedAt: Date.now() - 100000,
      stage: 1,
      status: 'active',
      sessionToken,
      stage1EnteredAt: Date.now() - 100000,
      stage1OpensAt: Date.now() - 50000, // Unlock Stage 1 Phase 2 (Solve)
      memberCount: 4,
      seed: 'diag_seed_1234'
    },
    members: [
      { id: 'm1_' + Date.now(), teamId, fullName: 'Alice Leader', isLeader: 1 },
      { id: 'm2_' + Date.now(), teamId, fullName: 'Bob Operative', isLeader: 0 },
      { id: 'm3_' + Date.now(), teamId, fullName: 'Charlie Tech', isLeader: 0 },
      { id: 'm4_' + Date.now(), teamId, fullName: 'Diana Crypto', isLeader: 0 }
    ],
    stages: 6
  });

  // Launch Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 }
  });

  // Set session cookie
  await context.addCookies([
    {
      name: 'fo_leader_token',
      value: sessionToken,
      url: baseUrl
    }
  ]);

  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') consoleErrors.push(text);
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  // Handle all confirms automatically
  let lastDialogMessage = '';
  page.on('dialog', async dialog => {
    lastDialogMessage = dialog.message();
    console.log(`[DIALOG] ${dialog.type()}: "${dialog.message()}" -> accepting`);
    await dialog.accept();
  });

  // -------------------------------------------------------------
  // 0.2: R3 LAMP DIAGNOSIS
  // -------------------------------------------------------------
  console.log('\n--- 0.2: R3 LAMP BLINK DIAGNOSIS ---');
  await page.goto(`${baseUrl}/`);
  await page.waitForSelector('#optical-beacon-lamp', { timeout: 5000 });

  const initialLampInfo = await page.evaluate(() => {
    const lamp = document.getElementById('optical-beacon-lamp');
    const cs = window.getComputedStyle(lamp);
    return {
      classes: lamp.className,
      bgColor: cs.backgroundColor,
      border: cs.border,
      boxShadow: cs.boxShadow,
      width: cs.width,
      height: cs.height
    };
  });
  console.log('Initial Lamp Computed Style:', initialLampInfo);

  const strobeBtnExists = await page.evaluate(() => {
    const btn = document.getElementById('btn-trigger-strobe');
    return { exists: !!btn, disabled: btn?.disabled, text: btn?.textContent };
  });
  console.log('Strobe Button State:', strobeBtnExists);

  // Click Watch Light Blink and sample lamp state over time
  console.log('Clicking #btn-trigger-strobe and sampling styles every 50ms for 3.5s...');
  await page.click('#btn-trigger-strobe');

  const samples = [];
  const startTime = Date.now();
  while (Date.now() - startTime < 3500) {
    const sample = await page.evaluate(() => {
      const lamp = document.getElementById('optical-beacon-lamp');
      const cs = window.getComputedStyle(lamp);
      const status = document.getElementById('optical-beacon-status')?.textContent;
      return {
        t: Date.now(),
        classes: lamp.className,
        bgColor: cs.backgroundColor,
        status
      };
    });
    sample.elapsed = sample.t - startTime;
    samples.push(sample);
    await page.waitForTimeout(50);
  }

  // Analyze samples
  const distinctClasses = [...new Set(samples.map(s => s.classes))];
  const distinctBgColors = [...new Set(samples.map(s => s.bgColor))];
  console.log('Distinct Classes Observed during sequence:', distinctClasses);
  console.log('Distinct Computed Background Colors Observed:', distinctBgColors);
  console.log(`Class changes detected: ${distinctClasses.length > 1}`);
  console.log(`Background color changes detected: ${distinctBgColors.length > 1}`);

  // Test with prefers-reduced-motion
  console.log('\nTesting with prefers-reduced-motion: reduce...');
  const reducedMotionContext = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: 'reduce'
  });
  await reducedMotionContext.addCookies([{ name: 'fo_leader_token', value: sessionToken, url: baseUrl }]);
  const rmPage = await reducedMotionContext.newPage();
  await rmPage.goto(`${baseUrl}/`);
  await rmPage.waitForSelector('#btn-trigger-strobe');
  await rmPage.click('#btn-trigger-strobe');
  await rmPage.waitForTimeout(500);
  const rmStatus = await rmPage.evaluate(() => document.getElementById('optical-beacon-status')?.textContent);
  console.log('Status under reduced-motion after click:', rmStatus);
  await reducedMotionContext.close();

  // -------------------------------------------------------------
  // 0.3: R4 HINT DIAGNOSIS (STAGE 1 & STAGE 2)
  // -------------------------------------------------------------
  console.log('\n--- 0.3: R4 HINT BUTTON DIAGNOSIS ---');

  // Intercept network requests
  const hintNetworkEvents = [];
  page.on('request', req => {
    if (req.url().includes('/api/hint')) {
      hintNetworkEvents.push({
        type: 'request',
        method: req.method(),
        url: req.url(),
        headers: req.headers(),
        postData: req.postData()
      });
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/hint')) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch {}
      hintNetworkEvents.push({
        type: 'response',
        status: res.status(),
        headers: res.headers(),
        body: bodyText
      });
    }
  });

  // Check Stage 1 Hint Click
  console.log('Clicking Hint button in Stage 1 Solve View...');
  const stage1ChartBefore = await page.evaluate(() => !!document.getElementById('stage1-morse-chart-panel'));
  console.log('Stage 1 Morse Chart panel exists in DOM BEFORE hint click:', stage1ChartBefore);

  await page.click('#btn-request-hint');
  await page.waitForTimeout(600);

  const stage1ChartAfter = await page.evaluate(() => {
    const panel = document.getElementById('stage1-morse-chart-panel');
    return {
      exists: !!panel,
      display: panel ? window.getComputedStyle(panel).display : null,
      timerText: document.getElementById('chart-timer-sec')?.textContent
    };
  });
  console.log('Stage 1 Morse Chart panel state AFTER hint click:', stage1ChartAfter);
  console.log('Stage 1 Hint Network Events:', JSON.stringify(hintNetworkEvents, null, 2));

  // Advance to Stage 2 and test Hint
  console.log('\nAdvancing team to Stage 2 and testing Hint in Stage 2...');
  await ds.updateTeam(teamId, { stage: 2 });
  // Seed Stage 2 sequence for team
  const { generateSequence } = require('../server/logic/stage2Randomizer');
  const seq = generateSequence('diag_seed_1234');
  await ds.setTeamSequence(teamId, seq.fragmentOrder, seq.expectedAnswer);

  await page.goto(`${baseUrl}/`);
  await page.waitForSelector('.toolkit-box');

  hintNetworkEvents.length = 0;
  console.log('Clicking Hint button in Stage 2 View...');
  await page.click('#btn-request-hint');
  await page.waitForTimeout(600);

  const stage2HintUiState = await page.evaluate(() => {
    const hintBtn = document.getElementById('btn-request-hint');
    const toast = document.querySelector('.toast-container')?.textContent;
    const bodyText = document.getElementById('app-main')?.textContent;
    return {
      buttonText: hintBtn?.textContent?.trim(),
      toastText: toast?.trim(),
      hasHintContainerInCard: !!document.querySelector('.hint-box, .stage-hint-text, .hint-panel')
    };
  });
  console.log('Stage 2 UI State after Hint click:', stage2HintUiState);
  console.log('Stage 2 Hint Network Events:', JSON.stringify(hintNetworkEvents, null, 2));

  // Check hint_config on SQLite
  const sqliteHintConfigs = await ds.getAllHintConfigs();
  console.log(`\nSQLite hint_config count: ${sqliteHintConfigs.length}`);
  console.log('SQLite hint_config rows:');
  sqliteHintConfigs.forEach(h => {
    console.log(`  - Stage ${h.stage} Hint ${h.hintNumber}: [${h.id}] "${h.text.slice(0, 40)}..." (duration: ${h.displayDurationSeconds}s, cost: ${h.penaltyMinutes}m)`);
  });

  // Check hint_config on Supabase if env configured
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sbClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
      const { data: sbHints, error: sbErr } = await sbClient.from('hint_config').select('*');
      if (sbErr) {
        console.log(`Supabase hint_config check error: ${sbErr.message}`);
      } else {
        console.log(`Supabase hint_config count: ${sbHints?.length || 0}`);
      }
    } catch (e) {
      console.log(`Supabase hint_config check failed: ${e.message}`);
    }
  } else {
    console.log('Supabase not verified: credentials missing');
  }

  // -------------------------------------------------------------
  // 0.4: R5 STAGE 2 ANSWER INVESTIGATION
  // -------------------------------------------------------------
  console.log('\n--- 0.4: R5 STAGE 2 ANSWER INVESTIGATION ---');
  const storedSeq = await ds.getTeamSequence(teamId);
  const teamStoredExpected = storedSeq?.expectedAnswer;

  // Unpack decoded plaintext from mission.json
  const b64 = mission.stage2.encodedText;
  const hex = Buffer.from(b64, 'base64').toString('utf8');
  const bytes = Buffer.from(hex, 'hex').toString('utf8');
  const rot13 = bytes.replace(/[a-zA-Z]/g, c => {
    const b = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
  });
  console.log('Encoded text in mission.json decodes to:', `"${rot13}"`);

  // Step list displayed on screen
  const displayedStepList = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.sequence-chip'));
    return chips.map(c => ({
      step: c.querySelector('.chip-step-num')?.textContent?.trim(),
      label: c.querySelector('.chip-frag-label')?.textContent?.trim(),
      code: c.querySelector('.chip-frag-code')?.textContent?.trim()
    }));
  });
  const assembledFromStepList = displayedStepList.map(s => s.code).join('');
  console.log('Displayed Step List in UI:', displayedStepList);
  console.log('Assembled string from step list:', assembledFromStepList);
  console.log('Stored expectedAnswer in DB:', teamStoredExpected);

  console.log('Comparison:');
  console.log(`  - Assembled step list matches stored expectedAnswer? ${assembledFromStepList.toLowerCase() === teamStoredExpected.toLowerCase() ? 'MATCH' : 'NO MATCH'}`);
  console.log(`  - Decoded plaintext contains "FRAGMENT TWO IS 8M4"? ${rot13.includes('FRAGMENT TWO IS 8M4') ? 'YES' : 'NO'}`);

  // Test UI submission of "8M4" and "8m4"
  console.log('\nTesting submission of "8M4":');
  await page.fill('#stage-answer-input', '8M4');
  await page.click('#btn-submit-answer');
  await page.waitForTimeout(500);
  const feedback8M4 = await page.evaluate(() => document.getElementById('submit-feedback')?.textContent);
  console.log('UI Feedback for "8M4":', `"${feedback8M4}"`);

  console.log('Testing submission of "8m4":');
  await page.fill('#stage-answer-input', '8m4');
  await page.click('#btn-submit-answer');
  await page.waitForTimeout(500);
  const feedback8m4 = await page.evaluate(() => document.getElementById('submit-feedback')?.textContent);
  console.log('UI Feedback for "8m4":', `"${feedback8m4}"`);

  // Check prefilled Vigenere key
  const vigenereDefaultVal = await page.evaluate(() => {
    const inp = document.getElementById('vigenere-key-input');
    return { value: inp?.value, placeholder: inp?.placeholder };
  });
  console.log('Vigenere key input in DOM:', vigenereDefaultVal);

  // -------------------------------------------------------------
  // 0.5: R2 STAGE 1 CHART INVESTIGATION
  // -------------------------------------------------------------
  console.log('\n--- 0.5: R2 STAGE 1 CHART INVESTIGATION ---');
  console.log(`morseChart in mission.json letter count: ${mission.stage1.morseChart?.length}`);
  console.log(`Letters present: ${mission.stage1.morseChart?.map(m => m.letter).join(', ')}`);
  console.log(`Is chart fixed in mission.json? ${Array.isArray(mission.stage1.morseChart) ? 'YES' : 'NO'}`);

  // -------------------------------------------------------------
  // 0.6: R5 STAGE 2 LAYOUT & COMPUTED STYLES (360, 768, 1366, 1920)
  // -------------------------------------------------------------
  console.log('\n--- 0.6: R5 STAGE 2 LAYOUT AT MULTIPLE VIEWPORTS ---');
  const viewports = [360, 768, 1366, 1920];
  const layoutResults = {};

  for (const w of viewports) {
    await page.setViewportSize({ width: w, height: 768 });
    await page.waitForTimeout(300);

    const layoutData = await page.evaluate((width) => {
      // Find elements with scrollWidth > clientWidth
      const allEls = Array.from(document.querySelectorAll('#app-main *'));
      const overflowing = allEls
        .filter(el => el.scrollWidth > el.clientWidth && el.clientWidth > 0 && window.getComputedStyle(el).overflowX !== 'auto')
        .map(el => ({ tag: el.tagName, id: el.id, className: el.className, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));

      // Button and input heights in workbench
      const controls = Array.from(document.querySelectorAll('.toolkit-box button, .toolkit-box input, .toolkit-box textarea'));
      const controlHeights = controls.map(c => ({
        id: c.id || c.className,
        tag: c.tagName,
        height: c.getBoundingClientRect().height,
        computedHeight: window.getComputedStyle(c).height
      }));

      // Typography
      const title = document.querySelector('.stage-card-title, .card-title, h2');
      const body = document.querySelector('.intro-body, p');
      const label = document.querySelector('.toolkit-section-label, label');
      const btn = document.querySelector('.toolkit-box button');
      const input = document.getElementById('toolkit-input');
      const payload = document.getElementById('stage2-cipher-raw');

      function getTypo(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight
        };
      }

      // Native inputs background
      const nativeInputs = Array.from(document.querySelectorAll('input, textarea')).map(i => ({
        id: i.id || i.className,
        bgColor: window.getComputedStyle(i).backgroundColor,
        color: window.getComputedStyle(i).color
      }));

      return {
        width,
        overflowing,
        controlHeights: controlHeights.slice(0, 10),
        typo: {
          title: getTypo(title),
          body: getTypo(body),
          label: getTypo(label),
          button: getTypo(btn),
          input: getTypo(input),
          payload: getTypo(payload)
        },
        nativeInputs
      };
    }, w);

    layoutResults[w] = layoutData;
    console.log(`[VIEWPORT ${w}px] Overflowing elements: ${layoutData.overflowing.length}`);
    if (layoutData.overflowing.length > 0) {
      console.log('   Sample overflow:', layoutData.overflowing.slice(0, 3));
    }
  }

  // Save Screenshots at 1366x768 and 390x844
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(__dirname, '../docs/ui-review/stage2_before_1366.png'), fullPage: true });
  console.log('Saved screenshot: docs/ui-review/stage2_before_1366.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(__dirname, '../docs/ui-review/stage2_before_390.png'), fullPage: true });
  console.log('Saved screenshot: docs/ui-review/stage2_before_390.png');

  // Write full diagnostic results to a JSON file for analysis
  fs.writeFileSync(
    path.join(__dirname, 'diag_results.json'),
    JSON.stringify({
      lamp: { initialLampInfo, strobeBtnExists, distinctClasses, distinctBgColors, samples: samples.slice(0, 20) },
      hints: { stage1ChartBefore, stage1ChartAfter, stage2HintUiState, sqliteHintConfigs },
      stage2Answer: { assembledFromStepList, teamStoredExpected, rot13, feedback8M4, feedback8m4, vigenereDefaultVal },
      layout: layoutResults,
      consoleErrors
    }, null, 2)
  );
  console.log('Wrote full raw diagnosis data to scripts/diag_results.json');

  // Teardown
  await browser.close();
  server.close();
  try { fs.unlinkSync(testDbPath); } catch {}
  console.log('\n======================================================');
  console.log('DIAGNOSTICS COMPLETE');
  console.log('======================================================');
}

runDiagnostics().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
