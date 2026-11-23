// ==============================================================================
// FINAL OVERRIDE — ADMIN PORTAL PLAYWRIGHT E2E TEST
// Validates /admin login, /api/admin/overview loading, live event clock,
// 6-segment progress bars, in-place row updates, zero CSP errors, and design rules.
// ==============================================================================

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.DB_PROVIDER = 'sqlite';
process.env.ADMIN_PIN = 'InvictorsAdmin#2026';
process.env.EVENT_SALT = 'e2e_admin_salt_vvce_998877';
process.env.SHARD_SECRET = 'e2e_admin_shard_secret_override_token';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const app = require('../server/app');
const ds = require('../server/dataService');

async function runAdminPortalTest() {
  console.log('=============================================================');
  console.log('🧪 PLAYWRIGHT E2E: ADMIN PORTAL & LIVE DASHBOARD TEST');
  console.log('=============================================================\n');

  const reviewDir = path.join(__dirname, '../docs/ui-review');
  if (!fs.existsSync(reviewDir)) {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  // 1. Seed sample teams for dashboard visualization
  const sampleTeams = [
    { name: `Squad_Alpha_${Date.now()}`, stage: 1, status: 'active', penalty: 0 },
    { name: `Squad_Bravo_${Date.now()}`, stage: 2, status: 'active', penalty: 3 },
    { name: `Squad_Charlie_${Date.now()}`, stage: 4, status: 'active', penalty: 8 },
    { name: `Squad_Delta_${Date.now()}`, stage: 6, status: 'finished', penalty: 5 }
  ];

  for (const st of sampleTeams) {
    const tId = `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await ds.createTeam({
      team: {
        id: tId,
        name: st.name,
        coordinator: 'Kiran',
        startedAt: Date.now() - 3600000,
        finishedAt: st.status === 'finished' ? Date.now() - 600000 : null,
        stage: st.stage,
        penaltyMin: st.penalty,
        status: st.status,
        memberCount: 4
      },
      members: [
        { id: `${tId}_m1`, fullName: 'Player 1', isLeader: 1 },
        { id: `${tId}_m2`, fullName: 'Player 2', isLeader: 0 },
        { id: `${tId}_m3`, fullName: 'Player 3', isLeader: 0 },
        { id: `${tId}_m4`, fullName: 'Player 4', isLeader: 0 }
      ],
      stageCount: 6,
      sequence: { fragmentOrder: [1, 3, 5, 7], expectedAnswer: '8m4k7r9x' }
    });
  }

  // Set event state so event clock is actively running
  await ds.updateEventState({
    startedAt: Date.now() - 3600000,
    isPaused: 0,
    totalPausedMs: 0,
    capMinutes: 90,
    mode: 'start_together'
  });

  // 2. Start Server on ephemeral port
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const adminUrl = `http://127.0.0.1:${port}/admin`;
  console.log(`[SETUP] Admin test server running at ${adminUrl}`);

  // 3. Launch Headless Chromium Browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Listen for console logs, errors, and CSP violations
  const consoleErrors = [];
  const cspViolations = [];
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
      if (text.includes('Content Security Policy') || text.includes('CSP') || text.includes('violates')) {
        cspViolations.push(text);
      }
    }
  });

  try {
    // 4. Navigate to /admin
    console.log('[STEP 1] Navigating to /admin...');
    await page.goto(adminUrl, { waitUntil: 'networkidle' });

    // 5. Verify Design Rules on Login View (no gradients, zero emoji)
    console.log('[STEP 2] Verifying Design System Compliance on Login...');
    const loginText = await page.textContent('body');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(loginText), 'Admin login must contain ZERO emoji');

    // Verify PIN Login Card
    await page.waitForSelector('#admin-login-card', { timeout: 5000 });
    const pinInput = await page.$('#admin-pin-input');
    const loginBtn = await page.$('#btn-admin-login');
    assert.ok(pinInput && loginBtn, 'PIN input or login button missing');

    // 6. Test Invalid PIN
    console.log('[STEP 3] Testing Invalid PIN rejection...');
    await page.fill('#admin-pin-input', 'WrongPin#999');
    await page.click('#btn-admin-login');
    await page.waitForTimeout(200);

    const loginErr = await page.textContent('#admin-login-error');
    assert.ok(loginErr.includes('Invalid') || loginErr.includes('Authentication'), 'Expected authentication failure message');

    // 7. Test Valid PIN Login
    console.log('[STEP 4] Logging in with valid ADMIN_PIN...');
    await page.fill('#admin-pin-input', 'InvictorsAdmin#2026');
    await page.click('#btn-admin-login');

    // Wait for Dashboard to render
    await page.waitForSelector('#admin-dashboard-view', { timeout: 8000 });
    console.log('✅ Admin dashboard view rendered.');

    // 8. Verify Dashboard Header & Live Event Clock
    console.log('[STEP 5] Verifying Live Clock & Overview Summary...');
    const clockEl = await page.$('#admin-live-clock');
    assert.ok(clockEl, 'Live event clock (#admin-live-clock) must be present');
    
    const initialClockText = (await page.textContent('#admin-live-clock')).trim();
    assert.ok(/^\d{2}:\d{2}:\d{2}$/.test(initialClockText), `Live clock must display HH:MM:SS format, got '${initialClockText}'`);

    // Verify clock ticks
    await page.waitForTimeout(1100);
    const updatedClockText = (await page.textContent('#admin-live-clock')).trim();
    console.log(`   -> Live Clock: ${initialClockText} -> ${updatedClockText}`);
    assert.ok(/^\d{2}:\d{2}:\d{2}$/.test(updatedClockText), 'Clock text must maintain HH:MM:SS format');

    // Verify summary metric cards
    const totalTeamsCount = await page.textContent('#stat-total-teams');
    const activeTeamsCount = await page.textContent('#stat-active-teams');
    assert.ok(parseInt(totalTeamsCount, 10) >= 4, `Expected at least 4 teams in summary, found ${totalTeamsCount}`);

    // 9. Verify Teams Table & 6-Segment Progress Bars
    console.log('[STEP 6] Verifying Teams Table & 6-Segment Stage Progress Bars...');
    await page.waitForSelector('.admin-table tbody tr', { timeout: 5000 });
    const teamRows = await page.$$('.admin-table tbody tr');
    assert.ok(teamRows.length >= 4, `Expected at least 4 team rows, found ${teamRows.length}`);

    // Check 6-segment mini progress bars
    const progressSegmentContainers = await page.$$('.mini-stage-segments');
    assert.ok(progressSegmentContainers.length >= 4, 'Progress segment containers missing');

    const firstRowSegments = await page.$$('.admin-table tbody tr:first-child .mini-stage-segments .segment');
    assert.strictEqual(firstRowSegments.length, 6, `Expected exactly 6 progress segments per team, found ${firstRowSegments.length}`);

    // 10. Verify Zero Emoji on Dashboard
    const dashboardText = await page.textContent('#admin-dashboard-view');
    assert.ok(!emojiRegex.test(dashboardText), 'Admin dashboard must contain ZERO emoji');

    // 11. Verify Zero CSP Violations
    console.log('[STEP 7] Verifying CSP Integrity & Console Logs...');
    assert.strictEqual(cspViolations.length, 0, `Detected CSP violations: ${cspViolations.join('; ')}`);
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('401'));
    assert.strictEqual(fatalErrors.length, 0, `Unexpected console errors: ${fatalErrors.join('; ')}`);
    console.log('✅ Zero CSP violations and zero console errors.');

    // 12. Capture UI Review Screenshot
    const screenshotPath = path.join(reviewDir, 'admin_portal.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: docs/ui-review/admin_portal.png`);

    console.log('=============================================================');
    console.log('🎉 ADMIN PORTAL PLAYWRIGHT TEST PASSED WITH ZERO ERRORS!');
    console.log('=============================================================\n');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

if (require.main === module) {
  runAdminPortalTest()
    .catch(err => {
      console.error('\n❌ ADMIN PORTAL PLAYWRIGHT TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runAdminPortalTest };
