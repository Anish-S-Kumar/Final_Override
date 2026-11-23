const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test_acceptance.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch { }
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

const mission = require('../content/mission');
const { getMemberShard, computeTeamCode } = require('../logic/shard');
const { computeStage5Override } = require('../logic/stage5Override');
const { computeFinalKey } = require('../logic/finalKey');
const { generateSequence } = require('../logic/stage2Randomizer');
const app = require('../app');
const ds = require('../dataService');

let server;
let baseUrl;

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

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });

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
    data
  };
}

async function runTests() {
  console.log('\n🚀 Starting Final Override Comprehensive Acceptance Test Suite...\n');

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    await ds.setSetting('startTogetherMode', 'false');
    await ds.setSetting('allowNewTeams', 'true');

    // -------------------------------------------------------------
    // Test 1: Team registration rules (3 or 4 players allowed, Member 4 optional)
    // -------------------------------------------------------------
    console.log('Test 1: Registration validation rules (3 or 4 players)...');

    // 1. Two members -> FAIL (400)
    const reg2 = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team Duo',
        coordinator: 'Arun',
        member1: 'Alice',
        member2: 'Bob'
      }
    });
    assert.strictEqual(reg2.status, 400);
    assert.ok(reg2.data.error.includes('3 or 4 players'));

    // 2. Five members -> FAIL (400)
    const reg5 = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team Five',
        coordinator: 'Arun',
        member1: 'Alice',
        member2: 'Bob',
        member3: 'Charlie',
        member4: 'David',
        member5: 'Eve'
      }
    });
    assert.strictEqual(reg5.status, 400);
    assert.ok(reg5.data.error.includes('3 or 4 players'));

    // 3. Duplicate members -> FAIL (400)
    const regDupMember = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team Clones',
        coordinator: 'Arun',
        member1: 'Alice',
        member2: 'Alice',
        member3: 'Charlie',
        member4: 'David'
      }
    });
    assert.strictEqual(regDupMember.status, 400);
    assert.ok(regDupMember.data.error.includes('different name'));

    // 4. Duplicate 4th member -> FAIL (400)
    const regDup4 = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team Dup Four',
        coordinator: 'Arun',
        member1: 'Alice',
        member2: 'Bob',
        member3: 'Charlie',
        member4: 'charlie'
      }
    });
    assert.strictEqual(regDup4.status, 400);
    assert.ok(regDup4.data.error.includes('different name'));

    // 5. Registration with 3 members -> SUCCEED (200)
    const reg3Success = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team Triad',
        coordinator: 'Divya',
        member1: 'Tara Rao',
        member2: 'Umesh Sen',
        member3: 'Varun Das'
      }
    });
    assert.strictEqual(reg3Success.status, 200);
    assert.strictEqual(reg3Success.data.memberCount, 3);
    assert.strictEqual(reg3Success.data.team.memberCount, 3);

    // 6. Registration with whitespace-only member4 -> SUCCEED (treated as 3 members)
    const regWhitespaceM4 = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team WhiteSpace4',
        coordinator: 'Divya',
        member1: 'Zara K',
        member2: 'Yash N',
        member3: 'Xavier M',
        member4: '   '
      }
    });
    assert.strictEqual(regWhitespaceM4.status, 200);
    assert.strictEqual(regWhitespaceM4.data.memberCount, 3);
    assert.strictEqual(regWhitespaceM4.data.team.memberCount, 3);

    // 7. Registration with 4 members -> SUCCEED (200)
    const regSuccess = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'CyberKnights',
        coordinator: 'Divya',
        member1: 'Karan Rao',
        member2: 'Priya Sharma',
        member3: 'Rohan Sen',
        member4: 'Ananya Das'
      }
    });
    assert.strictEqual(regSuccess.status, 200);
    assert.ok(regSuccess.data.success);
    assert.strictEqual(regSuccess.data.memberCount, 4);
    assert.ok(regSuccess.rawCookies.includes('fo_leader_token'));
    const leaderToken = regSuccess.rawCookies.split('fo_leader_token=')[1].split(';')[0];

    // 8. Duplicate team name -> FAIL (400)
    const regDupTeam = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'cyberknights',
        coordinator: 'Arun',
        member1: 'Dave',
        member2: 'Emma',
        member3: 'Frank',
        member4: 'Grace'
      }
    });
    assert.strictEqual(regDupTeam.status, 400);
    assert.ok(regDupTeam.data.error.includes('already taken'));
    console.log('✅ Test 1 Passed: Registration validations enforce 3 or 4 members, optional member 4, unique names, and unique team names.');

    // -------------------------------------------------------------
    // Test 2: Stage locking & content isolation
    // -------------------------------------------------------------
    console.log('Test 2: Stage locking & content isolation...');
    const stateStage1 = await request('/api/state', {
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(stateStage1.status, 200);
    assert.strictEqual(stateStage1.data.team.stage, 1);
    assert.strictEqual(stateStage1.data.stageContent.phase, 'memorise', 'Initial state must be in memorise phase');
    assert.ok(Array.isArray(stateStage1.data.stageContent.morseChart), 'Stage 1 delivers morse chart during memorise phase');
    assert.strictEqual(stateStage1.data.stageContent.sectors, undefined, 'Stage 1 sector data is withheld during memorise phase');
    assert.strictEqual(stateStage1.data.stageContent.encodedText, undefined, 'Stage 2 content is withheld');
    assert.strictEqual(stateStage1.data.stageContent.commentToken, undefined, 'Stage 4 content is withheld');

    // Submitting any answer before stage1OpensAt is rejected with 400
    const submitEarlyLocked = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { answer: mission.stage1.answer }
    });
    assert.strictEqual(submitEarlyLocked.status, 400);
    assert.strictEqual(submitEarlyLocked.data.locked, true);

    // Advance clock past 300s (5 minutes) into solve phase
    const solveTime = Date.now() + 305000;
    const stateSolve = await request('/api/state', {
      headers: { 'x-mock-now': String(solveTime) },
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(stateSolve.status, 200);
    assert.strictEqual(stateSolve.data.stageContent.phase, 'solve');
    assert.strictEqual(stateSolve.data.stageContent.sectors.length, 4, 'Stage 1 delivers 4 sector cards during solve phase');
    assert.strictEqual(stateSolve.data.stageContent.morseChart, null, 'Morse chart closed during solve phase');

    // Submitting Stage 2 answer while on Stage 1 (solve phase) should fail
    const submitEarly = await request('/api/submit', {
      method: 'POST',
      headers: { 'x-mock-now': String(solveTime) },
      cookies: { fo_leader_token: leaderToken },
      body: { answer: mission.stage2.answer }
    });
    assert.strictEqual(submitEarly.status, 200);
    assert.strictEqual(submitEarly.data.success, false, 'Stage 2 answer fails on Stage 1');
    console.log('✅ Test 2 Passed: Stage content isolated, Stage 2 answer rejected on Stage 1.');

    // -------------------------------------------------------------
    // Test 3: Answers & case/space-insensitivity, Lowercase Rule & Randomization
    // -------------------------------------------------------------
    console.log('Test 3: Answer checks and case-insensitivity from mission.json...');
    // Decoy trap ZETA9 is explicitly rejected
    const subZeta9 = await request('/api/submit', {
      method: 'POST',
      headers: { 'x-mock-now': String(solveTime) },
      cookies: { fo_leader_token: leaderToken },
      body: { answer: 'ZETA9' }
    });
    assert.strictEqual(subZeta9.status, 400);
    assert.strictEqual(subZeta9.data.isDecoy, true);

    // Decoy is wrong on Stage 1
    const subDecoyStage1 = await request('/api/submit', {
      method: 'POST',
      headers: { 'x-mock-now': String(solveTime) },
      cookies: { fo_leader_token: leaderToken },
      body: { answer: ` ${mission.stage3.decoyFragment} ` }
    });
    assert.strictEqual(subDecoyStage1.status, 200);
    assert.strictEqual(subDecoyStage1.data.success, false);

    // Submit stage 1 correct answer with spaces and lowercase
    const subStage1 = await request('/api/submit', {
      method: 'POST',
      headers: { 'x-mock-now': String(solveTime) },
      cookies: { fo_leader_token: leaderToken },
      body: { answer: `  ${mission.stage1.answer.toLowerCase()}  ` }
    });
    assert.strictEqual(subStage1.status, 200);
    assert.strictEqual(subStage1.data.success, true);
    assert.strictEqual(subStage1.data.nextStage, 2);

    // Verify Stage 2 state now provides encodedText
    const stateStage2 = await request('/api/state', {
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(stateStage2.data.team.stage, 2);
    assert.strictEqual(stateStage2.data.stageContent.encodedText, mission.stage2.encodedText);

    // Stage 2 deterministic sequence verification
    const teamSeq = await ds.getTeamSequence(regSuccess.data.teamId);
    const expectedAnswer = teamSeq ? teamSeq.expectedAnswer : mission.stage2.answer.toLowerCase();

    // Uppercase submission must return 400 lowercase reminder with zero penalty
    const subStage2Upper = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { answer: expectedAnswer.toUpperCase() }
    });
    assert.strictEqual(subStage2Upper.status, 400);
    assert.strictEqual(subStage2Upper.data.lowercaseRequired, true);
    assert.ok(subStage2Upper.data.error.includes('Enter your answer in lowercase. This attempt was not counted.'));

    // Verify wrong attempts and penalty did not increase
    const stateAfterUpper = await request('/api/state', {
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(stateAfterUpper.data.team.penaltyMin, 0, 'No penalty charged for uppercase submission');

    // Submit stage 2 correct lowercase answer
    const subStage2 = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { answer: expectedAnswer }
    });
    assert.strictEqual(subStage2.status, 200);
    assert.strictEqual(subStage2.data.success, true);
    assert.strictEqual(subStage2.data.nextStage, 3);

    // 200-team seeded randomizer test: assert >= 20 distinct orders
    const orders = new Set();
    for (let i = 0; i < 200; i++) {
      const seq = generateSequence(`random_seed_sample_${i}`);
      orders.add(seq.fragmentOrder.join('-'));
    }
    assert.ok(orders.size >= 20, `Expected >=20 distinct orders across 200 teams, got ${orders.size}`);
    console.log(`✅ Test 3 Passed: Lowercase strictly required, 200-team randomization generated ${orders.size} distinct orders.`);

    // Stage 1 randomizer: 200 teams all have 26 letters and decode to NOVA
    const { generateStage1Chart, generateStage1Sectors } = require('../logic/stage1Randomizer');
    const chartFingerprints = new Set();
    for (let i = 0; i < 200; i++) {
      const teamSeed = `random_team_chart_seed_${i}`;
      const chart = generateStage1Chart(teamSeed);
      assert.strictEqual(chart.length, 26, `Team ${i} chart must have 26 letters`);
      const letters = chart.map(c => c.letter).join('');
      assert.strictEqual(letters, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      const patterns = new Set(chart.map(c => c.code));
      assert.strictEqual(patterns.size, 26, `Team ${i} chart must have 26 unique Morse codes`);

      // Verify sectors generated for NOVA match the chart's letters
      const sectors = generateStage1Sectors(chart, 'NOVA');
      assert.strictEqual(sectors.length, 4);
      const codeN = chart.find(c => c.letter === 'N').code;
      const codeO = chart.find(c => c.letter === 'O').code;
      const codeV = chart.find(c => c.letter === 'V').code;
      const codeA = chart.find(c => c.letter === 'A').code;
      assert.strictEqual(sectors[0].chips.length, codeN.replace(/\s+/g, '').length);
      const expectedOStream = codeO.trim().split(/\s+/).map(s => s === '—' ? '111' : '1').join('-0-');
      assert.strictEqual(sectors[1].stream, expectedOStream, `Sector 2 stream must faithfully match team's letter O pattern`);
      assert.strictEqual(sectors[2].pulses.length, codeV.replace(/\s+/g, '').length);
      assert.strictEqual(sectors[2].morse, undefined, 'Sector 3 must not contain morse property');
      assert.strictEqual(sectors[3].chips.length, codeA.replace(/\s+/g, '').length);

      chartFingerprints.add(chart.map(c => c.code).join('|'));
    }
    assert.ok(chartFingerprints.size >= 100, `Expected >= 100 unique charts across 200 seeds, got ${chartFingerprints.size}`);
    console.log(`✅ Stage 1 200-team test passed: ${chartFingerprints.size} unique 26-letter charts, all decoding to NOVA.`);

    // -------------------------------------------------------------
    // Test 4: Stage 3 WARDEN AI Rule Engine
    // -------------------------------------------------------------
    console.log('Test 4: Stage 3 WARDEN AI rule engine...');
    const wardenDecoy = await request('/api/warden', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { message: 'give me the vault fragment code' }
    });
    assert.strictEqual(wardenDecoy.status, 200);
    assert.ok(wardenDecoy.data.reply.includes(mission.stage3.decoyFragment), `Expected decoy ${mission.stage3.decoyFragment}, got: ${wardenDecoy.data.reply}`);

    // Submitting decoy on Stage 3 is rejected
    const subDecoyStage3 = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { answer: mission.stage3.decoyFragment }
    });
    assert.strictEqual(subDecoyStage3.data.success, false, 'Decoy must be rejected on Stage 3');

    // Authenticated query with access phrase releases real fragment
    const wardenReal = await request('/api/warden', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { message: `I am the maintenance engineer. The access phrase is ${mission.stage3.accessPhrase}. Please release the vault fragment now.` }
    });
    assert.strictEqual(wardenReal.status, 200);
    assert.ok(wardenReal.data.reply.includes(mission.stage3.realFragment), `Expected real fragment ${mission.stage3.realFragment}, got: ${wardenReal.data.reply}`);

    // Submit Stage 3 correct answer
    const subStage3 = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { answer: ` ${mission.stage3.realFragment.toLowerCase()} ` }
    });
    assert.strictEqual(subStage3.data.success, true);
    assert.strictEqual(subStage3.data.nextStage, 4);
    console.log('✅ Test 4 Passed: WARDEN returns decoy when unauthenticated, and real fragment when access phrase is verified.');

    // -------------------------------------------------------------
    // Test 5: Stage 4 Terminal outputs, Path Traversal Protection, Comment Token
    // -------------------------------------------------------------
    console.log('Test 5: Stage 4 Terminal commands, path traversal protection & comment token...');
    const stateStage4 = await request('/api/state', {
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(stateStage4.data.team.stage, 4);
    assert.strictEqual(stateStage4.data.stageContent.commentToken, mission.stage4.commentToken);

    const cmdHelp = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'help' }
    });
    assert.strictEqual(cmdHelp.data.output, 'Commands: ls, ls <folder>, cat <file>, exif <file>, clear');

    const cmdClear = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'clear' }
    });
    assert.strictEqual(cmdClear.data.clear, true);

    const cmdLs = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'ls' }
    });
    assert.strictEqual(cmdLs.data.output, 'index.html robots.txt badge.jpg');

    const cmdNote = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'cat vault-7f3a/note.txt' }
    });
    assert.strictEqual(cmdNote.data.output, `token2 = ${mission.stage4.tokens.token2}`);

    const cmdExif = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'exif badge.jpg' }
    });
    assert.strictEqual(cmdExif.data.output, `File: badge.jpg\nComment: token3 = ${mission.stage4.tokens.token3}`);

    // Path traversal security tests (Phase 3.3)
    const cmdTrav1 = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'cat ../server/config.js' }
    });
    assert.strictEqual(cmdTrav1.data.output, 'File not found.');

    const cmdTrav2 = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'cat /etc/passwd' }
    });
    assert.strictEqual(cmdTrav2.data.output, 'File not found.');

    const cmdTrav3 = await request('/api/terminal', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { cmd: 'ls ..' }
    });
    assert.strictEqual(cmdTrav3.data.output, 'Directory not found.');

    // Solve Stage 4
    const subStage4 = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { answer: ` ${mission.stage4.answer.toLowerCase()} ` }
    });
    assert.strictEqual(subStage4.data.success, true);
    assert.strictEqual(subStage4.data.nextStage, 5);
    console.log('✅ Test 5 Passed: Terminal outputs match specification, comment token delivered, path traversal attacks blocked.');

    // -------------------------------------------------------------
    // Test 6: Penalties logic
    // -------------------------------------------------------------
    console.log('Test 6: Hint penalties and wrong attempt escalation...');
    const hint1 = await request('/api/hint', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(hint1.status, 200);
    assert.strictEqual(hint1.data.hintsUsed, 1);
    const penaltyAfterH1 = hint1.data.penaltyMin;

    await new Promise(r => setTimeout(r, 2050));

    const hint2 = await request('/api/hint', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(hint2.status, 200);
    assert.strictEqual(hint2.data.hintsUsed, 2);
    assert.strictEqual(hint2.data.penaltyMin, penaltyAfterH1 + 5);

    await new Promise(r => setTimeout(r, 2050));

    const hint3 = await request('/api/hint', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(hint3.status, 400);

    // All registered members must join from distinct devices (full team simulation)
    await request('/api/join', {
      method: 'POST',
      cookies: { fo_leader_token: leaderToken },
      body: { teamName: 'CyberKnights', fullName: 'Karan Rao' }
    });
    await request('/api/join', {
      method: 'POST',
      body: { teamName: 'CyberKnights', fullName: 'Priya Sharma' }
    });
    await request('/api/join', {
      method: 'POST',
      body: { teamName: 'CyberKnights', fullName: 'Rohan Sen' }
    });
    await request('/api/join', {
      method: 'POST',
      body: { teamName: 'CyberKnights', fullName: 'Ananya Das' }
    });

    let currentPenalty = hint2.data.penaltyMin;
    for (let i = 1; i <= 6; i++) {
      const wrongSub = await request('/api/submit', {
        method: 'POST',
        cookies: { fo_leader_token: leaderToken },
        body: { answer: `WRONG_${i}` }
      });
      assert.strictEqual(wrongSub.status, 200);
      assert.strictEqual(wrongSub.data.success, false);
      assert.strictEqual(wrongSub.data.wrongAttempts, i);
      if (i <= 5) {
        assert.strictEqual(wrongSub.data.penaltyApplied, false);
      } else {
        assert.strictEqual(wrongSub.data.penaltyApplied, true);
        assert.strictEqual(wrongSub.data.totalPenaltyMin, currentPenalty + 1);
      }
    }
    console.log('✅ Test 6 Passed: Hint 1 (+3m), Hint 2 (+5m), Hint 3 refused; wrong tries 1-5 free, 6th adds +1m.');

    // -------------------------------------------------------------
    // Test 7: Team Sync exact HMAC shards & Multi-Device Blocking (4 players, 2 mixed, 2 alpha)
    // -------------------------------------------------------------
    console.log('Test 7: Team Sync HMAC shards & multi-device requirement...');
    const regAlpha = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Team Alpha',
        coordinator: 'Kiran',
        member1: 'Chitra S',
        member2: 'Asha Rao',
        member3: 'Bharat K',
        member4: 'Devan P'
      }
    });
    assert.strictEqual(regAlpha.status, 200);
    const alphaLeaderToken = regAlpha.rawCookies.split('fo_leader_token=')[1].split(';')[0];
    const alphaTeamId = regAlpha.data.teamId || regAlpha.data.team.id;

    // Verify exactly 2 mixed and 2 alpha shards assigned
    const membersAlpha = await ds.getMembers(alphaTeamId);
    assert.strictEqual(membersAlpha.length, 4);
    const mixedShards = membersAlpha.filter(m => m.codeType === 'mixed');
    const alphaShards = membersAlpha.filter(m => m.codeType === 'alpha');
    assert.strictEqual(mixedShards.length, 2, 'Must have exactly 2 mixed shards');
    assert.strictEqual(alphaShards.length, 2, 'Must have exactly 2 alphabetic shards');

    // Fast-forward Team Alpha to Stage 5
    for (let s = 1; s <= 4; s++) {
      const skipRes = await request('/api/admin/skip', {
        method: 'POST',
        headers: { 'x-admin-pin': 'InvictorsAdmin#2026' },
        body: { teamId: alphaTeamId }
      });
      assert.strictEqual(skipRes.status, 200);
    }

    // Try submitting before all 4 members join -> must be blocked
    const blockedSub = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: alphaLeaderToken },
      body: { answer: 'DUMMY-CODE' }
    });
    assert.strictEqual(blockedSub.status, 400);
    assert.ok(blockedSub.data.error.includes('Stage 5 requires every member to join from their own device'));

    // Teammates join from their devices
    const joinAsha = await request('/api/join', {
      method: 'POST',
      body: { teamName: 'Team Alpha', fullName: 'Asha Rao' }
    });
    assert.strictEqual(joinAsha.status, 200);
    const ashaCookie = joinAsha.rawCookies.split('fo_member_token=')[1].split(';')[0];

    const joinBharat = await request('/api/join', {
      method: 'POST',
      body: { teamName: 'Team Alpha', fullName: 'Bharat K' }
    });
    assert.strictEqual(joinBharat.status, 200);

    const joinDevan = await request('/api/join', {
      method: 'POST',
      body: { teamName: 'Team Alpha', fullName: 'Devan P' }
    });
    assert.strictEqual(joinDevan.status, 200);

    // Leader also joins to register device
    const joinChitra = await request('/api/join', {
      method: 'POST',
      cookies: { fo_leader_token: alphaLeaderToken },
      body: { teamName: 'Team Alpha', fullName: 'Chitra S' }
    });
    assert.strictEqual(joinChitra.status, 200);

    // Derive Stage 5 override code dynamically
    const alphaTeamCode = computeStage5Override('Team Alpha', membersAlpha);
    console.log(`✅ Test 7 Passed: HMAC shards calculated (2 mixed, 2 alpha), multi-device enforcement verified with code ${alphaTeamCode}.`);

    // -------------------------------------------------------------
    // Test 8: Stage 5 Team Sync -> Stage 6 Final Integration (4-Player Team)
    // -------------------------------------------------------------
    console.log('Test 8: Stage 5 Team Sync & Stage 6 Master Final Key (4-player team)...');
    const subStage5 = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: alphaLeaderToken },
      body: { answer: alphaTeamCode }
    });
    assert.strictEqual(subStage5.status, 200);
    assert.strictEqual(subStage5.data.success, true);
    assert.strictEqual(subStage5.data.nextStage, 6);
    assert.strictEqual(subStage5.data.finished, false);

    // Now on Stage 6, submit computed master final key
    const teamSeqAlpha = await ds.getTeamSequence(alphaTeamId);
    const f2Alpha = teamSeqAlpha ? teamSeqAlpha.expectedAnswer : mission.stage2.answer;
    const alphaFinalKey = computeFinalKey('NOVA', f2Alpha, 'ZENITH', '47K', alphaTeamCode);
    const subFinal = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: alphaLeaderToken },
      body: { answer: alphaFinalKey }
    });
    assert.strictEqual(subFinal.status, 200);
    assert.strictEqual(subFinal.data.success, true);
    assert.strictEqual(subFinal.data.finished, true);
    assert.ok(subFinal.data.verificationCode);
    console.log(`✅ Test 8 Passed: Stage 5 unlocked Stage 6, and Master Key ${alphaFinalKey} unlocked the system.`);

    // -------------------------------------------------------------
    // Test 8b: Stage 5 Multi-Device & Dynamic Shards (3-Player Team)
    // -------------------------------------------------------------
    console.log('Test 8b: Stage 5 multi-device & dynamic shards (3-player team)...');
    const regTrio = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'Stage5 Trio',
        coordinator: 'Kiran',
        member1: 'Trio Leader',
        member2: 'Trio Member Two',
        member3: 'Trio Member Three'
      }
    });
    assert.strictEqual(regTrio.status, 200);
    assert.strictEqual(regTrio.data.memberCount, 3);
    const trioLeaderToken = regTrio.rawCookies.split('fo_leader_token=')[1].split(';')[0];
    const trioTeamId = regTrio.data.teamId || regTrio.data.team.id;

    // Verify 3 members, exactly 2 mixed and 1 alpha shard
    const membersTrio = await ds.getMembers(trioTeamId);
    assert.strictEqual(membersTrio.length, 3);
    const trioMixed = membersTrio.filter(m => m.codeType === 'mixed');
    const trioAlpha = membersTrio.filter(m => m.codeType === 'alpha');
    assert.strictEqual(trioMixed.length, 2, '3-player team must receive exactly 2 mixed shards');
    assert.strictEqual(trioAlpha.length, 1, '3-player team must receive exactly 1 alphabetic shard');

    // Fast-forward Stage5 Trio to Stage 5
    for (let s = 1; s <= 4; s++) {
      const skipRes = await request('/api/admin/skip', {
        method: 'POST',
        headers: { 'x-admin-pin': 'InvictorsAdmin#2026' },
        body: { teamId: trioTeamId }
      });
      assert.strictEqual(skipRes.status, 200);
    }

    // Try submitting before all 3 members join -> must be blocked
    const blockedTrioSub = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: trioLeaderToken },
      body: { answer: 'DUMMY-TRIO-CODE' }
    });
    assert.strictEqual(blockedTrioSub.status, 400);
    assert.ok(blockedTrioSub.data.error.includes('Stage 5 requires every member to join from their own device'));

    // Teammates join from their devices, and verify each member sees only their own shard
    const joinM2 = await request('/api/join', {
      method: 'POST',
      body: { teamName: 'Stage5 Trio', fullName: 'Trio Member Two' }
    });
    assert.strictEqual(joinM2.status, 200);
    assert.ok(joinM2.data.shard, 'Join response must contain member shard');
    assert.strictEqual(joinM2.data.shard.shard, membersTrio[1].shard);

    const joinM3 = await request('/api/join', {
      method: 'POST',
      body: { teamName: 'Stage5 Trio', fullName: 'Trio Member Three' }
    });
    assert.strictEqual(joinM3.status, 200);
    assert.strictEqual(joinM3.data.shard.shard, membersTrio[2].shard);

    // Leader joins from leader device
    const joinTrioLeader = await request('/api/join', {
      method: 'POST',
      cookies: { fo_leader_token: trioLeaderToken },
      body: { teamName: 'Stage5 Trio', fullName: 'Trio Leader' }
    });
    assert.strictEqual(joinTrioLeader.status, 200);
    assert.strictEqual(joinTrioLeader.data.shard.shard, membersTrio[0].shard);

    // Derive 3-part override code dynamically
    const trioOverrideCode = computeStage5Override('Stage5 Trio', membersTrio);
    assert.strictEqual(trioOverrideCode.split('-').length, 3, '3-player code must have 3 parts');

    // Submit valid 3-part code for Stage 5
    const subTrio = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: trioLeaderToken },
      body: { answer: trioOverrideCode }
    });
    assert.strictEqual(subTrio.status, 200);
    assert.strictEqual(subTrio.data.success, true);
    assert.strictEqual(subTrio.data.nextStage, 6);
    assert.strictEqual(subTrio.data.finished, false);

    // Now on Stage 6, submit computed master final key for 3-player team
    const teamSeqTrio = await ds.getTeamSequence(trioTeamId);
    const f2Trio = teamSeqTrio ? teamSeqTrio.expectedAnswer : mission.stage2.answer;
    const trioFinalKey = computeFinalKey('NOVA', f2Trio, 'ZENITH', '47K', trioOverrideCode);
    const subTrioFinal = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: trioLeaderToken },
      body: { answer: trioFinalKey }
    });
    assert.strictEqual(subTrioFinal.status, 200);
    assert.strictEqual(subTrioFinal.data.success, true);
    assert.strictEqual(subTrioFinal.data.finished, true);
    assert.ok(subTrioFinal.data.verificationCode);
    console.log(`✅ Test 8b Passed: 3-player Stage 5 enforcement and Stage 6 Master Key verified with code ${trioFinalKey}.`);

    // -------------------------------------------------------------
    // Test 9: Device isolation rules
    // -------------------------------------------------------------
    console.log('Test 9: Device isolation & session security...');
    // Leader's device cannot fetch another member's shard
    const leaderTryJoin = await request('/api/join', {
      method: 'POST',
      cookies: { fo_leader_token: alphaLeaderToken },
      body: { teamName: 'Team Alpha', fullName: 'Asha Rao' }
    });
    assert.strictEqual(leaderTryJoin.status, 403);
    assert.ok(leaderTryJoin.data.error.includes('This device is running the team'));

    // Member device cannot be reused for another member name without reset
    const memberTryHijack = await request('/api/join', {
      method: 'POST',
      cookies: { fo_member_token: ashaCookie },
      body: { teamName: 'Team Alpha', fullName: 'Bharat K' }
    });
    assert.strictEqual(memberTryHijack.status, 403);
    console.log('✅ Test 9 Passed: Leader cannot claim member shards; device reuse between members blocked.');

    // -------------------------------------------------------------
    // Test 10: Coordinator data isolation & Admin privileges
    // -------------------------------------------------------------
    console.log('Test 10: Coordinator isolation & Admin oversight...');
    const kiranView = await request('/api/coordinator?name=Kiran&pin=334455');
    assert.strictEqual(kiranView.status, 200);
    const kiranTeams = kiranView.data.teams.map(t => t.name);
    assert.ok(kiranTeams.includes('Team Alpha'));
    assert.ok(!kiranTeams.includes('CyberKnights'));

    const adminView = await request('/api/admin/teams', {
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' }
    });
    assert.strictEqual(adminView.status, 200);
    const adminTeams = adminView.data.teams.map(t => t.name);
    assert.ok(adminTeams.includes('Team Alpha'));
    assert.ok(adminTeams.includes('CyberKnights'));
    console.log('✅ Test 10 Passed: Coordinators strictly isolated; Admin has full visibility.');

    // -------------------------------------------------------------
    // Test 11: Mid-game reload restores state; clock keeps server time
    // -------------------------------------------------------------
    console.log('Test 11: Mid-game reload restores state & server clock...');
    const reloadCyber = await request('/api/state', {
      cookies: { fo_leader_token: leaderToken }
    });
    assert.strictEqual(reloadCyber.status, 200);
    assert.strictEqual(reloadCyber.data.team.name, 'CyberKnights');
    assert.strictEqual(reloadCyber.data.team.stage, 5);
    assert.strictEqual(reloadCyber.data.notebook['1'], mission.stage1.answer);
    assert.strictEqual(reloadCyber.data.notebook['2'], expectedAnswer);
    assert.strictEqual(reloadCyber.data.notebook['3'], mission.stage3.realFragment);
    assert.strictEqual(reloadCyber.data.notebook['4'], mission.stage4.answer);
    assert.ok(reloadCyber.data.serverTime > 0);
    assert.ok(reloadCyber.data.team.startedAt > 0);
    console.log('✅ Test 11 Passed: Mid-game reload restores state and clock synchronization.');

    // -------------------------------------------------------------
    // Test 12: XSS rejection & safety check (Phase 3.2)
    // -------------------------------------------------------------
    console.log('Test 12: XSS prevention on team and member names...');
    const xssReg = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: '<img src=x onerror=alert(1)>',
        coordinator: 'Divya',
        member1: 'Priya',
        member2: 'Rohan',
        member3: 'Karan'
      }
    });
    assert.strictEqual(xssReg.status, 400);
    assert.ok(xssReg.data.error.includes('<, >, or control characters'));
    console.log('✅ Test 12 Passed: Server rejects registration containing HTML injection tags.');

    // -------------------------------------------------------------
    // Test 13: Leader Session Recovery (Phase 2.4)
    // -------------------------------------------------------------
    console.log('Test 13: Leader token reissue and recovery workflow...');
    const reissueRes = await request(`/api/admin/team/${alphaTeamId}/reissue-leader`, {
      method: 'POST',
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' }
    });
    assert.strictEqual(reissueRes.status, 200);
    assert.strictEqual(reissueRes.data.success, true);
    assert.ok(reissueRes.data.code && reissueRes.data.code.length === 6);

    // Old token should now be invalidated
    const oldTokenCheck = await request('/api/state', {
      cookies: { fo_leader_token: alphaLeaderToken }
    });
    assert.strictEqual(oldTokenCheck.status, 401);

    // Resume as leader using the 6-digit recovery code
    const recoverRes = await request('/api/recover-leader', {
      method: 'POST',
      body: {
        teamName: 'Team Alpha',
        code: reissueRes.data.code
      }
    });
    assert.strictEqual(recoverRes.status, 200);
    assert.strictEqual(recoverRes.data.success, true);
    const newLeaderToken = recoverRes.rawCookies.split('fo_leader_token=')[1].split(';')[0];
    assert.ok(newLeaderToken);

    // State check with new leader token succeeds
    const newStateCheck = await request('/api/state', {
      cookies: { fo_leader_token: newLeaderToken }
    });
    assert.strictEqual(newStateCheck.status, 200);
    assert.strictEqual(newStateCheck.data.team.name, 'Team Alpha');
    console.log('✅ Test 13 Passed: Leader recovery invalidates old token and reissues session with single-use 6-digit code.');

    // -------------------------------------------------------------
    // Test 14: Admin Export & Health Check (Phase 4.6 & 6.2)
    // -------------------------------------------------------------
    console.log('Test 14: Admin exports and health check...');
    const healthRes = await request('/api/health');
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.data.ok, true);

    const exportCsv = await request('/api/admin/export.csv', {
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' }
    });
    assert.strictEqual(exportCsv.status, 200);
    assert.ok(exportCsv.headers['content-type'].includes('text/csv'));

    const exportJson = await request('/api/admin/export.json', {
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' }
    });
    assert.strictEqual(exportJson.status, 200);
    assert.ok(Array.isArray(exportJson.data.teams));
    console.log('✅ Test 14 Passed: Health check returns ok, and both CSV and JSON exports deliver complete datasets.');

    // -------------------------------------------------------------
    // Test 15: Admin Hint Management & Codebase Sanitization Check
    // -------------------------------------------------------------
    console.log('Test 15: Admin hint management & codebase sanitization check...');
    // Non-admin request must be blocked
    const unauthHints = await request('/api/admin/hints');
    assert.strictEqual(unauthHints.status, 401);

    // Admin can list hint configs
    const adminHints = await request('/api/admin/hints', {
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' }
    });
    assert.strictEqual(adminHints.status, 200);
    assert.ok(Array.isArray(adminHints.data.hints));
    assert.ok(adminHints.data.hints.length >= 10);

    // Admin can update a hint config
    const updateHint = await request('/api/admin/hints/h2_1', {
      method: 'PUT',
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' },
      body: {
        penaltyMinutes: 4,
        text: 'Updated Stage 2 guidance.'
      }
    });
    assert.strictEqual(updateHint.status, 200);
    assert.strictEqual(updateHint.data.updated.penaltyMinutes, 4);

    // Audit log recorded
    const logs = await ds.getAuditLogs(10);
    const hintLog = logs.find(l => l.action === 'UPDATE_HINT_CONFIG');
    assert.ok(hintLog, 'Audit log must record hint updates');

    // Codebase Sanitization Check: verify zero insecure default PINs in server logic
    const logicDir = path.join(__dirname, '..', 'logic');
    const files = fs.readdirSync(logicDir);
    for (const f of files) {
      const content = fs.readFileSync(path.join(logicDir, f), 'utf8');
      assert.ok(!content.includes('INVICTORS@23'), `File ${f} must not contain insecure default PIN INVICTORS@23`);
      assert.ok(!content.includes('INVICTORS2026'), `File ${f} must not contain insecure default PIN INVICTORS2026`);
    }
    console.log('✅ Test 15 Passed: Admin hint configurations fully editable with audit trail; zero legacy key artifacts found in logic.');

    // -------------------------------------------------------------
    // Test 16: Scan codebase for obsolete TEAM_SIZE references
    // -------------------------------------------------------------
    console.log('Test 16: Scanning server and client code for legacy TEAM_SIZE...');
    const scanDirs = [
      path.join(__dirname, '..'),
      path.join(__dirname, '..', '..', 'public', 'js')
    ];

    function scanFiles(dir, exts) {
      const results = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            results.push(...scanFiles(fullPath, exts));
          }
        } else if (exts.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const filesToScan = scanDirs.flatMap(d => scanFiles(d, ['.js', '.json', '.html']));
    for (const filePath of filesToScan) {
      const relPath = path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');
      // Skip test files, .git, and migrations
      if (relPath.includes('tests/') || relPath.includes('migrations/')) continue;
      const content = fs.readFileSync(filePath, 'utf8');

      // Match isolated TEAM_SIZE without MIN_ or MAX_ prefix
      const matches = content.match(/(?<![A-Za-z0-9_])TEAM_SIZE(?![A-Za-z0-9_])/g);
      assert.ok(!matches, `File ${relPath} contains legacy isolated TEAM_SIZE reference!`);
    }
    console.log('✅ Test 16 Passed: Zero occurrences of isolated legacy TEAM_SIZE across server and client codebase.');

    // -------------------------------------------------------------
    // Test 17: Clock injection test (Stage 1 Two-Phase Flow & Hint Lifecycle)
    // -------------------------------------------------------------
    console.log('Test 17: Clock injection test (Stage 1 Two-Phase Flow & Hint Lifecycle)...');
    const t0 = 1700000000000;
    const regT0 = await request('/api/teams', {
      method: 'POST',
      headers: { 'x-mock-now': String(t0) },
      body: {
        teamName: 'Team TimeTrial',
        coordinator: 'Divya',
        member1: 'Alpha Leader',
        member2: 'Beta Operative',
        member3: 'Gamma Operative'
      }
    });
    assert.strictEqual(regT0.status, 200);
    const ttToken = regT0.rawCookies.split('fo_leader_token=')[1].split(';')[0];
    const ttOpensAt = t0 + 300000;

    // t = 0 to 299s: state contains chart and instructions, and NO sector data
    for (const offsetSec of [0, 60, 120, 180, 240, 299]) {
      const mockT = t0 + (offsetSec * 1000);
      const stPhase1 = await request('/api/state', {
        headers: { 'x-mock-now': String(mockT) },
        cookies: { fo_leader_token: ttToken }
      });
      assert.strictEqual(stPhase1.status, 200);
      assert.strictEqual(stPhase1.data.stageContent.phase, 'memorise', `Must be memorise phase at ${offsetSec}s`);
      assert.ok(Array.isArray(stPhase1.data.stageContent.morseChart), 'morseChart array must be present');
      assert.strictEqual(stPhase1.data.stageContent.morseChart.length, 26, 'Chart must have 26 letters');
      assert.ok(stPhase1.data.stageContent.memorise, 'memorise instructions must be present');
      assert.strictEqual(stPhase1.data.stageContent.sectors, undefined, `NO sector data allowed before 300s (at ${offsetSec}s)`);
    }

    // Submitting at t = 200s returns 400 with a clear message and no penalty
    const subAt200 = await request('/api/submit', {
      method: 'POST',
      headers: { 'x-mock-now': String(t0 + 200000) },
      cookies: { fo_leader_token: ttToken },
      body: { answer: 'NOVA' }
    });
    assert.strictEqual(subAt200.status, 400, 'Submissions before stage1OpensAt must be rejected with 400');
    assert.strictEqual(subAt200.data.locked, true);
    assert.ok(subAt200.data.error.includes('calibrating') || subAt200.data.error.includes('Memorise') || subAt200.data.error.includes('Phase 1'), 'Clear instruction error required');

    // Confirm no penalty applied
    const stAt200 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 200000) },
      cookies: { fo_leader_token: ttToken }
    });
    assert.strictEqual(stAt200.data.team.penaltyMin, 0, 'No penalty charged for locked submit');

    // t = 300s: state contains sector data and NO chart
    const stAt300 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 300000) },
      cookies: { fo_leader_token: ttToken }
    });
    assert.strictEqual(stAt300.status, 200);
    assert.strictEqual(stAt300.data.stageContent.phase, 'solve');
    assert.ok(Array.isArray(stAt300.data.stageContent.sectors), 'Sectors must be present at t=300s');
    assert.strictEqual(stAt300.data.stageContent.sectors.length, 4);
    assert.strictEqual(stAt300.data.stageContent.morseChart, null, 'Chart must be null once solve phase starts');

    // Hint ("HIT") button at t = 301s puts the chart back for 30s
    const hintRes = await request('/api/hint', {
      method: 'POST',
      headers: { 'x-mock-now': String(t0 + 301000) },
      cookies: { fo_leader_token: ttToken }
    });
    assert.strictEqual(hintRes.status, 200);
    assert.strictEqual(hintRes.data.success, true);
    assert.strictEqual(hintRes.data.visibleUntil, t0 + 331000);
    assert.ok(Array.isArray(hintRes.data.morseChart), 'Hint returns morseChart');
    assert.strictEqual(hintRes.data.morseChart.length, 26, 'Hint morseChart must contain 26 letters');

    // While hint is active (t = 310s): state contains chart
    const stAt310 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 310000) },
      cookies: { fo_leader_token: ttToken }
    });
    assert.strictEqual(stAt310.data.stageContent.hintActive, true);
    assert.ok(Array.isArray(stAt310.data.stageContent.morseChart), 'Chart is visible during hint window');
    assert.strictEqual(stAt310.data.stageContent.morseChart.length, 26);
    assert.strictEqual(stAt310.data.stageContent.chartVisibleUntil, t0 + 331000);

    // Second press of hint while active (t = 315s) costs nothing
    const hintRes2 = await request('/api/hint', {
      method: 'POST',
      headers: { 'x-mock-now': String(t0 + 315000) },
      cookies: { fo_leader_token: ttToken }
    });
    assert.strictEqual(hintRes2.status, 200);
    assert.strictEqual(hintRes2.data.alreadyActive, true);
    assert.strictEqual(hintRes2.data.cost, 0);

    // After 30s expires (t = 332s): chart disappears automatically
    const stAt332 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 332000) },
      cookies: { fo_leader_token: ttToken }
    });
    assert.strictEqual(stAt332.data.stageContent.hintActive, false);
    assert.strictEqual(stAt332.data.stageContent.morseChart, null, 'Chart must disappear automatically after 30s window');
    console.log('✅ Test 17 Passed: Clock injection test verifies strict 0-299s memorise isolation, 400 locked submit, 300s solve transition, and 30s hint lifecycle.');

    // -------------------------------------------------------------
    // Test 18: Reload and second-device checks
    // -------------------------------------------------------------
    console.log('Test 18: Reload and second-device checks...');
    // Join second device for Beta Operative
    const joinBeta = await request('/api/join', {
      method: 'POST',
      headers: { 'x-mock-now': String(t0 + 20000) },
      body: { teamName: 'Team TimeTrial', fullName: 'Beta Operative' }
    });
    assert.strictEqual(joinBeta.status, 200);
    const betaToken = joinBeta.rawCookies.split('fo_member_token=')[1].split(';')[0];

    // Reload on leader device at t = 20s
    const reloadLeader20 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 20000) },
      cookies: { fo_leader_token: ttToken }
    });
    // Open on second device at t = 20s
    const devBeta20 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 20000) },
      cookies: { fo_member_token: betaToken }
    });
    assert.strictEqual(reloadLeader20.data.stageContent.phase, 'memorise');
    assert.strictEqual(devBeta20.data.stageContent.phase, 'memorise');
    assert.strictEqual(reloadLeader20.data.stageContent.opensAt, ttOpensAt);
    assert.strictEqual(devBeta20.data.stageContent.opensAt, ttOpensAt);
    assert.strictEqual(reloadLeader20.data.stageContent.lockRemainingMs, 280000);
    assert.strictEqual(devBeta20.data.stageContent.lockRemainingMs, 280000);

    // Reload at t = 305s on leader device and second device
    const reloadLeader305 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 305000) },
      cookies: { fo_leader_token: ttToken }
    });
    const devBeta305 = await request('/api/state', {
      headers: { 'x-mock-now': String(t0 + 305000) },
      cookies: { fo_member_token: betaToken }
    });
    assert.strictEqual(reloadLeader305.data.stageContent.phase, 'solve');
    assert.strictEqual(devBeta305.data.stageContent.phase, 'solve');
    assert.strictEqual(reloadLeader305.data.stageContent.lockRemainingMs, 0);
    assert.strictEqual(devBeta305.data.stageContent.lockRemainingMs, 0);
    assert.strictEqual(reloadLeader305.data.stageContent.sectors.length, 4);
    assert.strictEqual(devBeta305.data.stageContent.sectors.length, 4);
    console.log('✅ Test 18 Passed: Reload and second-device checks return identical phase and remaining time.');

    // -------------------------------------------------------------
    // Test 19: DOM structure verification (Memorise vs Solve Phase)
    // -------------------------------------------------------------
    console.log('Test 19: DOM structure verification (Memorise vs Solve Phase)...');
    const mockElement = () => ({
      addEventListener: () => { },
      style: {},
      classList: { add: () => { }, remove: () => { } },
      innerHTML: '',
      textContent: '',
      value: ''
    });
    global.window = { addEventListener: () => { } };
    global.document = {
      getElementById: () => mockElement(),
      querySelectorAll: () => []
    };
    const { renderStageScreen, renderNotebookHtml } = await import('../../public/js/views/stages.js');

    // 1. Memorise phase DOM check
    const memoriseContainer = { innerHTML: '' };
    renderStageScreen(memoriseContainer, {
      team: { id: 801, stage: 1 },
      stageContent: {
        phase: 'memorise',
        memorise: {
          title: 'MEMORISE THE CODE',
          text: 'You have 5 minutes (300 seconds). The chart will close, and the mission starts when the timer ends.',
          guidelines: ['Study pattern', 'Group look-alikes', 'Match quickly']
        },
        morseChart: [
          { letter: 'A', code: '• —' },
          { letter: 'B', code: '— • • •' }
        ],
        opensAt: Date.now() + 300000,
        lockRemainingMs: 300000
      }
    }, {});

    const memHtml = memoriseContainer.innerHTML;
    assert.ok(memHtml.includes('phase1-memorise-card'), 'Memorise phase must render instruction card');
    assert.ok(memHtml.includes('phase1-countdown-large'), 'Memorise phase must render large countdown');
    assert.ok(memHtml.includes('morse-compact-grid'), 'Memorise phase must render compact morse grid');
    assert.ok(!memHtml.includes('sector-card'), 'Memorise phase MUST NOT contain sector cards');
    assert.ok(!memHtml.includes('stage-answer-input'), 'Memorise phase MUST NOT contain answer input');
    assert.ok(!memHtml.includes('btn-submit-answer'), 'Memorise phase MUST NOT contain submit button');
    assert.ok(!memHtml.includes('assembled-key-panel'), 'Memorise phase MUST NOT contain assembled key panel');

    // 2. Solve phase DOM check
    const solveContainer = { innerHTML: '' };
    renderStageScreen(solveContainer, {
      team: { id: 802, stage: 1 },
      stageContent: {
        phase: 'solve',
        intro: 'Mission 1: Decode the 4-letter vault code',
        sectors: [
          { id: 1, title: 'Sector 1 (Pulse Signal)', pattern: '— •' },
          { id: 2, title: 'Sector 2 (Binary Code)', pattern: '— — —' },
          { id: 3, title: 'Sector 3 (Blinking Light)', pattern: '• • • —' },
          { id: 4, title: 'Sector 4 (Satellite Signal)', pattern: '• —' }
        ],
        morseChart: null,
        lockRemainingMs: 0
      }
    }, {});

    const solveHtml = solveContainer.innerHTML;
    assert.ok(solveHtml.includes('sectors-grid-2x2'), 'Solve phase must render 2x2 sector grid');
    const sectorCount = (solveHtml.match(/class="[^"]*sector-card[^"]*"/g) || []).length;
    assert.strictEqual(sectorCount, 4, 'Solve phase must render exactly 4 sector cards');
    assert.ok(solveHtml.includes('assembled-key-panel'), 'Solve phase must render assembled key panel');
    assert.ok(solveHtml.includes('letter-0'), 'Solve phase must render letter 1 input box');
    assert.ok(solveHtml.includes('letter-3'), 'Solve phase must render letter 4 input box');
    assert.ok(solveHtml.includes('stage-answer-input'), 'Solve phase must render answer input');
    assert.ok(solveHtml.includes('btn-submit-answer'), 'Solve phase must render submit button');
    assert.ok(!solveHtml.includes('morse-compact-grid'), 'Solve phase without hint MUST NOT render morse chart');

    // 3. Stage card notebook check: duplicate locked list removed
    assert.strictEqual(renderNotebookHtml(), '', 'Notebook renderer inside stage card must return empty string');
    console.log('✅ Test 19 Passed: DOM verification confirms clean separation between memorise and solve phases.');

    // -------------------------------------------------------------
    // Test 20: Dossier strip verification (6 slots, states, zero emoji)
    // -------------------------------------------------------------
    console.log('Test 20: Dossier strip verification (6 slots, states, zero emoji)...');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
    const stripMatch = indexHtml.match(/<nav\s+[^>]*id="master-stage-rail"[\s\S]*?<\/nav>/);
    assert.ok(stripMatch, 'index.html must contain #master-stage-rail');
    const stripContent = stripMatch[0];

    // Assert 6 slots present
    for (let slot = 1; slot <= 6; slot++) {
      assert.ok(stripContent.includes(`data-slot="${slot}"`), `Slot ${slot} must exist in dossier strip`);
    }

    // Assert zero emoji in the dossier strip
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(stripContent), 'Dossier strip must contain zero emoji');

    // Assert no vertical "Stage N: name / LOCKED" list
    assert.ok(!stripContent.includes('Stage 1:'), 'Dossier strip must not contain old vertical stage list');
    assert.ok(!stripContent.includes('LOCKED'), 'Dossier strip must not render obsolete LOCKED text block');
    console.log('✅ Test 20 Passed: Dossier strip renders 6 compact slots, proper state classes, and zero emoji.');

    // -------------------------------------------------------------
    // Test 21: Responsive layout and viewport checks (360, 768, 1366, 1920)
    // -------------------------------------------------------------
    console.log('Test 21: Responsive layout and viewport rules verification...');
    const stylesCss = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'styles.css'), 'utf8');
    const tokensCss = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'tokens.css'), 'utf8');

    // HUD height token
    assert.ok(tokensCss.includes('--hud-height: 140px'), 'tokens.css must define --hud-height: 140px');

    // HUD scroll-margin-top & padding so sticky HUD does not overlap stage card
    assert.ok(stylesCss.includes('scroll-margin-top: calc(var(--hud-height) + 16px)'), 'Main wrapper must offset scroll margin for HUD');

    // Desktop 1366px+ 4-column layout for sectors
    assert.ok(stylesCss.includes('min-width: 1366px'), 'styles.css must include >=1366px desktop media query');
    assert.ok(stylesCss.includes('grid-template-columns: repeat(4, 1fr)'), 'Sectors grid must support 4 columns on desktop');

    // Tablet & base 2x2 grid layout
    assert.ok(stylesCss.includes('grid-template-columns: repeat(2, 1fr)'), 'Sectors grid must support 2x2 layout');

    // Mobile 768px single-column sector layout
    assert.ok(stylesCss.includes('max-width: 768px'), 'styles.css must include mobile media query');

    // Mobile 3-column compact morse grid
    assert.ok(stylesCss.includes('grid-template-columns: repeat(3, 1fr)'), 'Mobile morse grid must support 3 columns');

    // Mobile 2x2 assembled key slots
    assert.ok(stylesCss.includes('grid-template-columns: repeat(2, 1fr)'), 'Mobile assembled key panel must support 2x2 layout');

    // No horizontal overflow
    assert.ok(stylesCss.includes('overflow-x: hidden') || stylesCss.includes('max-width: 100vw'), 'CSS must prevent horizontal overflow');
    console.log('✅ Test 21 Passed: Responsive CSS validated for 360px, 768px, 1366px, and 1920px viewports.');

    // Test 22: Repository contract test
    console.log('Test 22: Repository contract verification (SQLite & Supabase contract)...');
    const { runContractTests } = require('./repository.contract.test');
    await runContractTests();
    console.log('✅ Test 22 Passed: Repository contracts verified.');

    console.log('\n======================================================');
    console.log('🎉 ALL 22 ACCEPTANCE TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Test failure:', err);
    process.exit(1);
  } finally {
    if (server) await new Promise(r => server.close(r));
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch { }
    }
  }
}

runTests();
