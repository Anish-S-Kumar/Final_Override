const assert = require('assert');
const path = require('path');
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PIN = 'InvictorsAdmin#2026';
process.env.EVENT_SALT = 'final_override_secure_salt_vvce_998877';
process.env.SHARD_SECRET = 'shard_secret_override_token_77665544';
process.env.COORDINATORS = 'Divya,Kiran';
process.env.COORDINATOR_PINS = '112233,445566';
process.env.TIME_CAP_ENFORCED = 'false';

const app = require('../server/app');
const mission = require('../server/content/mission');

async function runAudit() {
  console.log('=== STARTING PHASE 0 DIAGNOSTIC CHECKS ===\n');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(endpoint, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (opts.cookies) {
      headers['Cookie'] = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, setCookie };
  }

  const ds = require('../server/dataService');
  await ds.setSetting('gameStarted', 'true');
  await ds.setSetting('startTogetherMode', 'false');

  // --- 0.5 Contract check ---
  console.log('--- 0.5 CONTRACT CHECK ON TEMPORARY SQLITE DB ---');
  const t0 = 1700000000000;
  const regRes = await api('/api/teams', {
    method: 'POST',
    headers: { 'x-mock-now': String(t0) },
    body: {
      teamName: 'ContractCheckTeam',
      coordinator: 'Divya',
      member1: 'Agent 1',
      member2: 'Agent 2',
      member3: 'Agent 3'
    }
  });
  console.log('Registration status:', regRes.status, 'memberCount:', regRes.data.memberCount);
  const leaderToken = regRes.setCookie.split('fo_leader_token=')[1].split(';')[0];

  const times = [
    { label: 't = 0 s', offset: 0 },
    { label: 't = 30 s', offset: 30000 },
    { label: 't = 61 s', offset: 61000 }
  ];

  for (const t of times) {
    const mockNow = t0 + t.offset;
    const stateRes = await api('/api/state', {
      headers: { 'x-mock-now': String(mockNow) },
      cookies: { fo_leader_token: leaderToken }
    });
    const sc = stateRes.data.stageContent || {};
    console.log(`\nState at ${t.label} (mockNow = ${mockNow}):`);
    console.log('  phase:', sc.phase);
    console.log('  lockRemainingMs:', sc.lockRemainingMs);
    console.log('  sectors present:', sc.sectors ? `YES (${sc.sectors.length} sectors)` : 'NO (withheld)');
    console.log('  morseChart present:', sc.morseChart ? `YES (${sc.morseChart.length} letters)` : 'NO (null)');
    console.log('  hintActive:', sc.hintActive);

    // DOM Rendering check using JSDOM
    const dom = new JSDOM(`<!DOCTYPE html><html><body><main id="app-main"></main></body></html>`, {
      runScripts: 'dangerously'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    const stagesModule = await import('../public/js/views/stages.js');
    const container = dom.window.document.getElementById('app-main');
    stagesModule.renderStageScreen(container, stateRes.data, { renderApp: () => {} });

    const html = container.innerHTML;
    const hasMemoriseCard = html.includes('phase1-memorise-card');
    const hasChart = html.includes('morse-compact-grid');
    const hasSectorCards = html.includes('sector-card');
    const hasKeySlots = html.includes('assembled-key-panel');
    const hasSubmit = html.includes('btn-submit-answer');
    console.log(`  DOM output at ${t.label}:`);
    console.log('    hasMemoriseCard:', hasMemoriseCard);
    console.log('    hasChart:', hasChart);
    console.log('    hasSectorCards:', hasSectorCards);
    console.log('    hasKeySlots:', hasKeySlots);
    console.log('    hasSubmit:', hasSubmit);
  }

  // --- 0.6 Hint check ---
  console.log('\n--- 0.6 HINT CHECK ---');
  // In solve phase (t = 61s)
  const hintReqTime = t0 + 61000;
  const hintRes = await api('/api/hint', {
    method: 'POST',
    headers: { 'x-mock-now': String(hintReqTime), 'Idempotency-Key': 'hint-check-1' },
    cookies: { fo_leader_token: leaderToken }
  });
  console.log('Hint request status:', hintRes.status);
  console.log('Hint response body:', JSON.stringify(hintRes.data));

  // --- 0.7 Answer consistency ---
  console.log('\n--- 0.7 ANSWER CONSISTENCY CHECK ---');
  console.log('Stage 1:');
  console.log('  Config answer:', mission.stage1.answer);
  console.log('  Config decoy:', mission.stage1.decoy);
  const s1DecodedFromSectors = (mission.stage1.sectors || []).map(s => {
    // Lookup morse in chart
    const match = mission.stage1.morseChart.find(m => m.code === s.morse);
    return match ? match.letter : '?';
  }).join('');
  console.log('  Decoded from sectors:', s1DecodedFromSectors);
  console.log('  Agreement:', s1DecodedFromSectors === mission.stage1.answer ? 'MATCH' : 'MISMATCH');

  console.log('Stage 2:');
  console.log('  Config answer:', mission.stage2.answer);
  console.log('  Config accessPhrase:', mission.stage2.accessPhrase);
  console.log('  Config fragments:', (mission.stage2.fragments || []).map(f => f.code).join('-'));
  // Decode Stage 2 encodedText: Base64 -> Hex -> ROT13
  try {
    const b64 = Buffer.from(mission.stage2.encodedText, 'base64').toString('utf8');
    const hex = Buffer.from(b64, 'hex').toString('utf8');
    const rot13 = hex.replace(/[a-zA-Z]/g, c => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(base + (c.charCodeAt(0) - base + 13) % 26);
    });
    console.log('  Decoded plaintext:', rot13);
  } catch (err) {
    console.log('  Decoded plaintext error:', err.message);
  }

  console.log('Stage 3:');
  console.log('  Config realFragment:', mission.stage3.realFragment);
  console.log('  Config decoyFragment:', mission.stage3.decoyFragment);
  console.log('  Config accessPhrase:', mission.stage3.accessPhrase);

  console.log('Stage 4:');
  console.log('  Config tokens:', JSON.stringify(mission.stage4.tokens));
  console.log('  Config answer:', mission.stage4.answer);
  const tokenJoined = Object.values(mission.stage4.tokens || {}).join('');
  console.log('  Tokens joined:', tokenJoined);
  console.log('  Agreement:', tokenJoined === mission.stage4.answer ? 'MATCH' : 'MISMATCH');

  // --- 0.8 Light timing ---
  console.log('\n--- 0.8 LIGHT TIMING (SECTOR 3) ---');
  const sector3 = (mission.stage1.sectors || []).find(s => s.id === 3 || s.badge === 'BLINKING LIGHT');
  if (sector3 && sector3.pulses) {
    console.log('  Sector 3 pulses config:', JSON.stringify(sector3.pulses));
  } else {
    console.log('  Sector 3 pulses not found');
  }

  server.close();
  console.log('\n=== DIAGNOSTIC CHECKS COMPLETE ===');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
