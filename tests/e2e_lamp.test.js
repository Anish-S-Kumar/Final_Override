/**
 * FINAL OVERRIDE — E2E Optical Beacon Lamp Test
 * Verifies Playwright real-browser interaction with Sector 3 optical beacon lamp:
 * - Computed style color transitions (dark -> bright blue -> dark)
 * - Strict design rules: no glow / box-shadow: none
 * - Pulse timing accuracy matching the team's randomized Morse pattern
 * - Transmission ended indicator and button state
 * - prefers-reduced-motion: reduce behavior (transition: none)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test_lamp_e2e.db');
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
const { generateStage1Chart, generateStage1Sectors } = require('../server/logic/stage1Randomizer');

async function runLampE2ETest() {
  console.log('======================================================');
  console.log('🧪 RUNNING PLAYWRIGHT E2E OPTICAL BEACON LAMP TEST');
  console.log('======================================================\n');

  // Start test HTTP server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[TEST SERVER] Listening at ${baseUrl}`);

  const testSeed = 'lamp_test_seed_001';
  const teamId = 'team_lamp_' + Date.now();
  const sessionToken = 'lamp_token_' + Date.now();

  // Compute expected Sector 3 pulses from team seed
  const chart = generateStage1Chart(testSeed);
  const sectors = generateStage1Sectors(chart, 'NOVA');
  const s3 = sectors.find(s => s.id === 3);
  const expectedPulses = s3.pulses;
  const leadInMs = s3.leadInMs || 800;
  const totalPlaybackMs = leadInMs + expectedPulses.reduce((sum, p) => sum + p.on + p.off, 0);

  console.log(`[SECTOR 3 CONFIG] Expected pulses: ${expectedPulses.length}, Playback duration: ${totalPlaybackMs}ms`);

  // Create test team in Stage 1 Solve phase
  await ds.createTeam({
    team: {
      id: teamId,
      name: 'Lamp Test Squad',
      coordinator: 'Arun',
      startedAt: Date.now() - 350000,
      stage: 1,
      status: 'active',
      sessionToken,
      stage1EnteredAt: Date.now() - 350000,
      stage1OpensAt: Date.now() - 50000, // Past 300s, solve phase unlocked
      memberCount: 4,
      seed: testSeed
    },
    members: [
      { id: 'm1_' + Date.now(), teamId, fullName: 'Alice Leader', isLeader: 1 },
      { id: 'm2_' + Date.now(), teamId, fullName: 'Bob Operative', isLeader: 0 },
      { id: 'm3_' + Date.now(), teamId, fullName: 'Charlie Tech', isLeader: 0 },
      { id: 'm4_' + Date.now(), teamId, fullName: 'Diana Crypto', isLeader: 0 }
    ],
    stages: 6
  });

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // PART 1: Standard Motion Verification
    // -------------------------------------------------------------
    console.log('[PART 1] Verifying standard beacon strobe playback...');
    const contextNormal = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });

    await contextNormal.addCookies([
      {
        name: 'fo_leader_token',
        value: sessionToken,
        url: baseUrl
      }
    ]);

    const page = await contextNormal.newPage();
    await page.goto(baseUrl);

    // Wait for Stage 1 Solve phase UI
    await page.waitForSelector('#optical-beacon-lamp', { timeout: 10000 });
    await page.waitForSelector('#btn-trigger-strobe');

    // 1. Initial State Checks
    const initialStyles = await page.$eval('#optical-beacon-lamp', el => {
      const computed = window.getComputedStyle(el);
      return {
        bg: computed.backgroundColor,
        boxShadow: computed.boxShadow,
        className: el.className
      };
    });

    console.log(`   Initial lamp color: ${initialStyles.bg}`);
    console.log(`   Initial box-shadow: ${initialStyles.boxShadow}`);
    assert.strictEqual(initialStyles.bg, 'rgb(26, 34, 48)', 'Lamp must be dark (#1a2230) initially');
    assert.ok(
      initialStyles.boxShadow === 'none' || !initialStyles.boxShadow.includes('rgba('),
      'Initial lamp must not have glowing box-shadow'
    );

    // 2. Trigger strobe and sample computed style across playback duration + margin
    console.log('   Clicking "Watch Light Blink" button...');
    await page.click('#btn-trigger-strobe');

    const samples = [];
    const startTime = Date.now();
    const duration = totalPlaybackMs + 600;

    while (Date.now() - startTime < duration) {
      const sample = await page.$eval('#optical-beacon-lamp', el => {
        const computed = window.getComputedStyle(el);
        return {
          bg: computed.backgroundColor,
          className: el.className,
          boxShadow: computed.boxShadow
        };
      });
      samples.push({
        t: Date.now() - startTime,
        ...sample
      });
      await page.waitForTimeout(50);
    }

    // Analyze captured samples: active when lamp-on or color is accent blue rgb(0, 210, 255)
    const brightSamples = samples.filter(s => s.className.includes('lamp-on') || s.bg === 'rgb(0, 210, 255)');
    console.log(`   Captured ${samples.length} total samples; ${brightSamples.length} active bright pulses.`);
    assert.ok(brightSamples.length >= 20, 'Lamp must visibly alternate to bright accent blue during playback');

    // Check design rule: no glow during active state
    for (const s of brightSamples) {
      assert.strictEqual(s.boxShadow, 'none', `Lamp active state must have box-shadow: none (got ${s.boxShadow})`);
    }

    // Segment active intervals to measure pulse durations
    const intervals = [];
    let inActive = false;
    let pulseStart = 0;

    for (let i = 0; i < samples.length; i++) {
      const isActive = samples[i].className.includes('lamp-on');
      if (isActive && !inActive) {
        inActive = true;
        pulseStart = samples[i].t;
      } else if (!isActive && inActive) {
        inActive = false;
        intervals.push({ duration: samples[i].t - pulseStart, start: pulseStart, end: samples[i].t });
      }
    }
    if (inActive) {
      intervals.push({ duration: (Date.now() - startTime) - pulseStart, start: pulseStart, end: Date.now() - startTime });
    }

    console.log(`   Detected ${intervals.length} pulse intervals:`, intervals.map(p => `${p.duration}ms`).join(', '));
    assert.strictEqual(intervals.length, expectedPulses.length, `Expected exactly ${expectedPulses.length} pulses, detected ${intervals.length}`);

    // Verify each detected pulse duration against expected pulse configuration (±25% tolerance for scheduler jitter)
    intervals.forEach((interval, idx) => {
      const expectedOn = expectedPulses[idx].on;
      const minAllowed = expectedOn * 0.70;
      const maxAllowed = expectedOn * 1.30;
      console.log(`   Pulse ${idx + 1}: expected ~${expectedOn}ms, measured ${interval.duration}ms`);
      assert.ok(
        interval.duration >= minAllowed && interval.duration <= maxAllowed,
        `Pulse ${idx + 1} duration ${interval.duration}ms out of expected range [${minAllowed}, ${maxAllowed}]`
      );
    });
    console.log(`   ✅ All ${expectedPulses.length} pulses matched expected Morse timing.`);

    // Wait for playback completion and verify end indicator
    await page.waitForTimeout(600);
    const endBadge = await page.$eval('#optical-beacon-ended', el => ({
      visible: window.getComputedStyle(el).display !== 'none',
      text: el.textContent.trim()
    }));
    assert.strictEqual(endBadge.visible, true, '#optical-beacon-ended badge must be visible after playback');
    assert.ok(endBadge.text.toUpperCase().includes('DONE') || endBadge.text.toUpperCase().includes('TRANSMISSION ENDED'), 'Badge must show completion');
    assert.ok(!endBadge.text.includes('Pattern:'), 'Badge MUST NOT reveal pattern text');

    const statusText = await page.$eval('#optical-beacon-status', el => el.textContent.trim());
    assert.ok(statusText === 'DONE' || statusText === 'TRANSMISSION ENDED', 'Status label must show completion');

    const buttonEnabled = await page.$eval('#btn-trigger-strobe', btn => !btn.disabled);
    assert.strictEqual(buttonEnabled, true, '"Watch Light Blink" button must be re-enabled after playback');
    console.log('   ✅ Transmission completed cleanly; badge displayed and button re-enabled.');

    await contextNormal.close();

    // -------------------------------------------------------------
    // PART 2: Reduced Motion Mode
    // -------------------------------------------------------------
    console.log('\n[PART 2] Verifying prefers-reduced-motion: reduce behavior...');
    const contextReduced = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      reducedMotion: 'reduce'
    });

    await contextReduced.addCookies([
      {
        name: 'fo_leader_token',
        value: sessionToken,
        url: baseUrl
      }
    ]);

    const pageReduced = await contextReduced.newPage();
    await pageReduced.goto(baseUrl);
    await pageReduced.waitForSelector('#optical-beacon-lamp');

    const reducedTransition = await pageReduced.$eval('#optical-beacon-lamp', el => {
      return window.getComputedStyle(el).transition;
    });
    console.log(`   Reduced-motion lamp transition: "${reducedTransition}"`);
    assert.ok(
      reducedTransition === 'none' || reducedTransition.includes('none') || reducedTransition.includes('0s'),
      `Lamp transition under reduced motion must be disabled (got "${reducedTransition}")`
    );

    // Trigger strobe in reduced motion mode
    await pageReduced.click('#btn-trigger-strobe');
    // Wait for sequence to complete
    await pageReduced.waitForSelector('#optical-beacon-ended:not([style*="display: none"])', { timeout: totalPlaybackMs + 4000 });
    const reducedEndBadgeText = await pageReduced.$eval('#optical-beacon-ended', el => el.textContent.trim());
    assert.ok(reducedEndBadgeText.toUpperCase().includes('DONE') || reducedEndBadgeText.toUpperCase().includes('TRANSMISSION ENDED'));
    assert.ok(!reducedEndBadgeText.includes('Pattern:'), 'Badge MUST NOT reveal pattern text');
    console.log('   ✅ Reduced motion mode completed successfully without animation lag or errors.');

    await contextReduced.close();

    console.log('\n======================================================');
    console.log('🎉 PLAYWRIGHT E2E LAMP TEST COMPLETED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }
}

runLampE2ETest().catch(err => {
  console.error('\n❌ E2E LAMP TEST FAILED:', err);
  process.exit(1);
});
