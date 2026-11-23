/**
 * Task 0: Complete Audit and Diagnosis Script
 * Investigates admin portal in real Playwright browser, database parity,
 * Stage 2 current architecture, and HUD clock/time-cap mechanics.
 */

const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = require('../server/app');
const config = require('../server/config');
const ds = require('../server/dataService');

async function runTask0Diagnosis() {
  console.log('======================================================');
  console.log('🔍 TASK 0: SYSTEM AUDIT & PLAYWRIGHT DIAGNOSTIC SUITE');
  console.log('======================================================\n');

  const diagData = {
    baseline: {},
    providerTruth: {},
    adminBrowser: {},
    databaseAudit: {},
    stage2Current: {},
    hudClock: {}
  };

  // 1. Data Provider Truth
  diagData.providerTruth = {
    envProvider: process.env.DB_PROVIDER || 'not set',
    envDataSource: process.env.DATA_SOURCE || 'not set',
    configProvider: config.DB_PROVIDER,
    activeAdapter: ds.isSupabase() ? 'SupabaseRepository' : 'SQLiteRepository'
  };

  // 2. Start ephemeral test server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[SERVER] Diagnostic server running at ${baseUrl}`);

  // 3. Playwright browser inspection on /admin
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const networkRequests = [];
  const consoleMessages = [];

  page.on('request', req => {
    networkRequests.push({
      type: 'request',
      method: req.method(),
      url: req.url()
    });
  });

  page.on('response', async res => {
    let body = '';
    try {
      body = await res.text();
    } catch (_) {}
    networkRequests.push({
      type: 'response',
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
      contentType: res.headers()['content-type'] || '',
      bodyPreview: body.slice(0, 300)
    });
  });

  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  console.log('[BROWSER] Navigating to /admin...');
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });

  // Check login form
  const loginFormExists = await page.$('#admin-login-form') !== null;
  const pinInputExists = await page.$('#admin-pin-input') !== null;
  console.log(`[BROWSER] Login form exists: ${loginFormExists}, PIN input: ${pinInputExists}`);

  // Submit admin login
  if (loginFormExists) {
    const adminPin = process.env.ADMIN_PIN || 'Invictors#Admin2026';
    await page.fill('#admin-pin-input', adminPin);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
  }

  // Inspect DOM state of admin view
  const adminCardExists = await page.$('#admin-dashboard-card') !== null;
  const clockStatus = await page.$eval('#admin-clock-status', el => el.textContent.trim()).catch(() => 'NOT FOUND');
  const teamCount = await page.$eval('#admin-team-count', el => el.textContent.trim()).catch(() => 'NOT FOUND');
  const teamsTbody = await page.$eval('#admin-teams-tbody', el => el.innerHTML.trim()).catch(() => 'NOT FOUND');
  const teamsRowsCount = await page.$$eval('#admin-teams-tbody tr', rows => rows.length).catch(() => 0);

  // Check if polling is running by waiting 3.5s and inspecting requests
  const reqCountBefore = networkRequests.length;
  await page.waitForTimeout(3500);
  const reqCountAfter = networkRequests.length;
  const newRequests = networkRequests.slice(reqCountBefore);

  diagData.adminBrowser = {
    loginFormExists,
    adminCardExists,
    clockStatusText: clockStatus,
    teamCountText: teamCount,
    teamsRowsCount,
    pollingRunning: newRequests.length > 0,
    newRequestsDuringWait: newRequests.map(r => `${r.method || ''} ${r.url || ''} (${r.status || 'req'})`),
    consoleMessages,
    networkSummary: networkRequests.map(r => `${r.type} ${r.method || ''} ${r.url} -> ${r.status || ''}`)
  };

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  // 4. Database Audit (SQLite & Supabase)
  console.log('\n[DATABASE AUDIT] Inspecting SQLite and Supabase...');
  const sqliteDb = require('../server/db');
  const sqliteTables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const sqliteTableCounts = {};
  for (const t of sqliteTables) {
    try {
      const cnt = sqliteDb.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get()?.c || 0;
      sqliteTableCounts[t.name] = cnt;
    } catch (e) {
      sqliteTableCounts[t.name] = `ERR: ${e.message}`;
    }
  }

  diagData.databaseAudit.sqlite = {
    tables: sqliteTables.map(t => t.name),
    counts: sqliteTableCounts
  };

  // Inspect Supabase if configured
  const sbConfig = config.getSupabaseConfig();
  diagData.databaseAudit.supabaseConfigured = sbConfig.isConfigured;
  if (sbConfig.isConfigured) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(sbConfig.url, sbConfig.secretKey, { auth: { persistSession: false } });
      const { data: pingData } = await sb.rpc('ping').catch(() => ({ data: null }));
      diagData.databaseAudit.supabasePing = pingData;

      // Check schema_version
      const { data: svData } = await sb.from('schema_version').select('*');
      diagData.databaseAudit.supabaseSchemaVersion = svData;

      // Check hint_config count
      const { count: hintCount } = await sb.from('hint_config').select('*', { count: 'exact', head: true });
      diagData.databaseAudit.supabaseHintConfigCount = hintCount;
    } catch (err) {
      diagData.databaseAudit.supabaseError = err.message;
    }
  }

  // 5. Stage 2 current audit
  const mission = require('../server/content/mission');
  diagData.stage2Current = {
    hasEncodedText: !!mission.stage2?.encodedText,
    encodedTextLen: mission.stage2?.encodedText?.length,
    plaintext: mission.stage2?.plaintext,
    modules: mission.stage2?.modules || null,
    layers: mission.stage2?.layers || null,
    answer: mission.stage2?.answer
  };

  // 6. HUD Clock & Time Cap Audit
  diagData.hudClock = {
    timeCapMinutes: config.TIME_CAP_MINUTES,
    timeCapEnforced: config.TIME_CAP_ENFORCED
  };

  // Write diagnosis JSON
  fs.writeFileSync(path.join(__dirname, 'task0_diag_output.json'), JSON.stringify(diagData, null, 2));
  console.log('✅ Diagnostic inspection completed. Output written to scripts/task0_diag_output.json');
}

runTask0Diagnosis().catch(err => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
