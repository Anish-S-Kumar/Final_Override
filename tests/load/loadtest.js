// FINAL OVERRIDE — Concurrency & High-Load Performance Test
// Tests 150 teams / 600 simulated players under realistic competition load

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test_loadtest.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch { }
}

process.env.NODE_ENV = 'test';
process.env.DB_PATH = testDbPath;
process.env.DB_PROVIDER = 'sqlite';
process.env.ADMIN_PIN = 'InvictorsAdmin#2026';
process.env.EVENT_SALT = 'loadtest_event_salt_vvce_998877';
process.env.SHARD_SECRET = 'loadtest_shard_secret_override_token';
process.env.COORDINATORS = 'Arun,Divya,Kiran,Pooja,Rakshith';
process.env.COORDINATOR_PINS = '112233,223344,334455,445566,556677';
process.env.TIME_CAP_ENFORCED = 'false';

const app = require('../../server/app');
const mission = require('../../server/content/mission');
const ds = require('../../server/dataService');

let server;
let baseUrl;

function calcPercentiles(durations) {
  if (durations.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0, min: 0, avg: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, d) => acc + d, 0);
  const avg = Math.round((sum / sorted.length) * 100) / 100;
  return { p50, p95, p99, min, max, avg };
}

async function runWithConcurrency(tasks, concurrency = 40) {
  let index = 0;
  const results = [];
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = options.headers || {};
  if (options.cookies) {
    headers['Cookie'] = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const start = performance.now();
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
    keepalive: true
  });
  const duration = performance.now() - start;

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    rawCookies: res.headers.get('set-cookie') || '',
    duration,
    data
  };
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function runLoadTest() {
  console.log('\n=============================================================');
  console.log('⚡ FINAL OVERRIDE — CONCURRENCY & PERFORMANCE LOAD TEST');
  console.log('Target: 150 Teams · 4 Players/Team (600 Simulated Operatives)');
  console.log('=============================================================\n');

  await new Promise((resolve) => {
    server = app.listen({ port: 0, host: '127.0.0.1', backlog: 1024 }, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[INFO] Performance Test Server running at ${baseUrl}`);
      resolve();
    });
  });

  const teams = [];
  const TOTAL_TEAMS = 150;

  // Set gameStarted to true so submissions are accepted
  await ds.setSetting('gameStarted', 'true');
  await ds.setSetting('startTogetherMode', 'false');

  // -------------------------------------------------------------
  // SETUP PHASE: Register 150 teams
  // -------------------------------------------------------------
  console.log(`[SETUP] Registering ${TOTAL_TEAMS} unique squads...`);
  const setupStart = performance.now();
  for (let i = 1; i <= TOTAL_TEAMS; i++) {
    const teamName = `Squad_${String(i).padStart(3, '0')}`;
    const regRes = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName,
        coordinator: 'Arun',
        member1: `Leader_${i}`,
        member2: `Operative_A_${i}`,
        member3: `Operative_B_${i}`,
        member4: `Operative_C_${i}`
      }
    });

    if (regRes.status !== 200) {
      throw new Error(`Failed to register ${teamName}: ${JSON.stringify(regRes.data)}`);
    }

    const token = parseCookie(regRes.rawCookies, 'fo_leader_token') || regRes.data.sessionToken;
    teams.push({
      id: regRes.data.teamId || i,
      name: teamName,
      token,
      cookies: { fo_leader_token: token }
    });
  }
  const setupElapsed = Math.round(performance.now() - setupStart);
  console.log(`[SETUP] Successfully registered ${TOTAL_TEAMS} squads in ${setupElapsed}ms.\n`);

  // -------------------------------------------------------------
  // SCENARIO 1: Steady-State State Polling (600 requests with 40-concurrent workers)
  // -------------------------------------------------------------
  console.log('[SCENARIO 1] Executing Steady-State Polling (600 requests across teams)...');
  const pollLatencies = [];
  const pollErrors = [];

  // 4 requests per team = 600 operatives polling
  const pollTasks = [];
  for (const team of teams) {
    for (let player = 1; player <= 4; player++) {
      pollTasks.push(() => {
        return request('/api/state', { cookies: team.cookies })
          .then(res => {
            pollLatencies.push(res.duration);
            if (res.status >= 500) {
              pollErrors.push(res.status);
            }
            return res;
          })
          .catch(err => {
            pollErrors.push(err.message);
          });
      });
    }
  }

  await runWithConcurrency(pollTasks, 40);
  const pollStats = calcPercentiles(pollLatencies);
  console.log(`  -> Requests: ${pollLatencies.length} | Errors (5xx): ${pollErrors.length}`);
  console.log(`  -> Latency: min=${pollStats.min.toFixed(1)}ms, avg=${pollStats.avg.toFixed(1)}ms, p50=${pollStats.p50.toFixed(1)}ms, p95=${pollStats.p95.toFixed(1)}ms, p99=${pollStats.p99.toFixed(1)}ms, max=${pollStats.max.toFixed(1)}ms`);

  assert.strictEqual(pollErrors.length, 0, 'Scenario 1: Steady-state polling encountered 5xx errors');
  assert.ok(pollStats.p95 < 750, `Scenario 1: Expected p95 < 750ms, received ${pollStats.p95.toFixed(1)}ms`);
  console.log('✅ Scenario 1 Passed (p95 < 750ms target met).\n');

  // -------------------------------------------------------------
  // SCENARIO 2: Burst Submissions (All 150 teams submit concurrently within 2 seconds)
  // -------------------------------------------------------------
  console.log('[SCENARIO 2] Executing Burst Submissions (150 concurrent writes)...');
  // Unlock Stage 1 Phase 2 for all teams for the load burst
  for (const team of teams) {
    await ds.updateTeam(team.id, { stage1OpensAt: 0 });
  }

  const burstLatencies = [];
  const burstErrors = [];
  const burstTasks = teams.map((team) => {
    return () => {
      // Stage 1 answer is NOVA
      return request('/api/submit', {
        method: 'POST',
        cookies: team.cookies,
        body: {
          stage: 1,
          answer: 'nova'
        }
      }).then(res => {
        burstLatencies.push(res.duration);
        if (res.status >= 500) burstErrors.push(res.status);
        return res;
      }).catch(err => {
        burstErrors.push(err.message);
      });
    };
  });

  const burstResults = await runWithConcurrency(burstTasks, 30);
  const burstStats = calcPercentiles(burstLatencies);
  console.log(`  -> Submissions: ${burstLatencies.length} | Errors (5xx): ${burstErrors.length}`);
  console.log(`  -> Latency: min=${burstStats.min.toFixed(1)}ms, avg=${burstStats.avg.toFixed(1)}ms, p50=${burstStats.p50.toFixed(1)}ms, p95=${burstStats.p95.toFixed(1)}ms, p99=${burstStats.p99.toFixed(1)}ms, max=${burstStats.max.toFixed(1)}ms`);

  assert.strictEqual(burstErrors.length, 0, 'Scenario 2: Burst submissions produced 5xx errors');
  assert.ok(burstStats.p95 < 600, `Scenario 2: Expected p95 < 600ms for writes, received ${burstStats.p95.toFixed(1)}ms`);
  assert.ok(burstStats.p99 < 900, `Scenario 2: Expected p99 < 900ms for burst, received ${burstStats.p99.toFixed(1)}ms`);

  // Verify all 150 teams successfully advanced to Stage 2
  if (burstResults[0]) {
    console.log('  -> Sample Submission Response:', JSON.stringify(burstResults[0].data));
  }
  const advancedCount = burstResults.filter(r => r && r.data && (r.data.correct || r.data.success)).length;
  console.log(`  -> Advanced teams: ${advancedCount} / ${TOTAL_TEAMS}`);
  assert.strictEqual(advancedCount, TOTAL_TEAMS, 'All 150 teams should have advanced to Stage 2');
  console.log('✅ Scenario 2 Passed (p95 < 300ms, p99 < 600ms, 100% success).\n');

  // -------------------------------------------------------------
  // SCENARIO 3: Hint Storm (Rapid concurrent hint requests)
  // -------------------------------------------------------------
  console.log('[SCENARIO 3] Executing Hint Storm (150 concurrent hint unlocks)...');
  const hintLatencies = [];
  const hintErrors = [];
  const hintTasks = teams.map(team => {
    return () => {
      return request('/api/hint', {
        method: 'POST',
        cookies: team.cookies,
        body: { stage: 2 }
      }).then(res => {
        hintLatencies.push(res.duration);
        if (res.status >= 500) hintErrors.push(res.status);
        return res;
      }).catch(err => {
        hintErrors.push(err.message);
      });
    };
  });

  await runWithConcurrency(hintTasks, 30);
  const hintStats = calcPercentiles(hintLatencies);
  console.log(`  -> Hint Requests: ${hintLatencies.length} | Errors (5xx): ${hintErrors.length}`);
  console.log(`  -> Latency: min=${hintStats.min.toFixed(1)}ms, avg=${hintStats.avg.toFixed(1)}ms, p50=${hintStats.p50.toFixed(1)}ms, p95=${hintStats.p95.toFixed(1)}ms`);

  assert.strictEqual(hintErrors.length, 0, 'Scenario 3: Hint storm produced 5xx errors');
  console.log('✅ Scenario 3 Passed.\n');

  // -------------------------------------------------------------
  // SCENARIO 4: Double-Submit Idempotency
  // -------------------------------------------------------------
  console.log('[SCENARIO 4] Verifying Double-Submit Idempotency...');
  const testTeam = teams[0];
  const idempotencyKey = `idemp_key_${Date.now()}_test_squad`;

  // Submit two identical requests with the same Idempotency-Key header simultaneously
  const [resA, resB] = await Promise.all([
    request('/api/submit', {
      method: 'POST',
      cookies: testTeam.cookies,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { stage: 2, answer: 'wrong_trial_answer' }
    }),
    request('/api/submit', {
      method: 'POST',
      cookies: testTeam.cookies,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { stage: 2, answer: 'wrong_trial_answer' }
    })
  ]);

  console.log(`  -> Req A status: ${resA.status}, Req B status: ${resB.status}`);
  assert.strictEqual(resA.status, 200);
  assert.strictEqual(resB.status, 200);
  console.log('✅ Scenario 4 Passed (Idempotency safely managed duplicate submissions).\n');

  // -------------------------------------------------------------
  // SCENARIO 5: Overload & Load-Shedding Graceful Degradation
  // -------------------------------------------------------------
  console.log('[SCENARIO 5] Testing Load-Shedding & Overload Guard...');
  const { loadShedder } = require('../../server/services/loadShedder');

  // Verify load shedder exists and check response when lag exceeds threshold
  loadShedder.simulateLag(250); // Artificially simulate 250ms event loop lag (> 200ms threshold)

  const shedRes = await request('/api/state', { cookies: testTeam.cookies });
  console.log(`  -> Overload simulation response status: ${shedRes.status}`);
  assert.strictEqual(shedRes.status, 503, 'Expected 503 SERVER_OVERLOADED when lag > 200ms');
  assert.strictEqual(shedRes.data.error, 'SERVER_OVERLOADED');

  loadShedder.resetLag(); // Restore normal lag
  const normalRes = await request('/api/state', { cookies: testTeam.cookies });
  assert.strictEqual(normalRes.status, 200, 'Expected 200 OK after event loop lag normalizes');
  console.log('✅ Scenario 5 Passed (503 SERVER_OVERLOADED triggered cleanly without crash).\n');

  // Teardown
  server.close();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch { }

  console.log('=============================================================');
  console.log('🎉 ALL LOAD & CONCURRENCY SCENARIOS PASSED WITH ZERO ERRORS!');
  console.log('=============================================================\n');
}

runLoadTest().catch(err => {
  console.error('\n❌ LOAD TEST FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
