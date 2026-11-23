process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.DB_PROVIDER = 'sqlite';
process.env.ADMIN_PIN = 'InvictorsAdmin#2026';
process.env.EVENT_SALT = 'final_override_secure_salt_vvce_998877';
process.env.SHARD_SECRET = 'shard_secret_override_token_77665544';
process.env.COORDINATORS = 'Kiran,Divya';
process.env.COORDINATOR_PINS = '112233,445566';
process.env.TIME_CAP_ENFORCED = 'false';

const assert = require('assert');
const mission = require('../server/content/mission');
const { getMemberShard } = require('../server/logic/shard');
const { computeStage5Override } = require('../server/logic/stage5Override');
const ds = require('../server/dataService');
const app = require('../server/app');

async function runDryRun() {
  const startTime = Date.now();
  console.log('⚡ Starting Final Override Automated Dry-Run Simulation (5 Stages)...');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    };
    if (opts.cookies) {
      headers['Cookie'] = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });

    const setCookie = res.headers.get('set-cookie') || '';
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, setCookie };
  }

  try {
    // Helper function to simulate a complete playthrough for a team
    async function simulateTeamPlaythrough({ teamName, membersList }) {
      console.log(`▶ Simulating team: ${teamName} (${membersList.length} operatives)...`);
      const regBody = {
        teamName,
        coordinator: 'Kiran',
        member1: membersList[0],
        member2: membersList[1],
        member3: membersList[2]
      };
      if (membersList[3]) {
        regBody.member4 = membersList[3];
      }

      // 1. Register team
      const regRes = await api('/api/teams', {
        method: 'POST',
        body: regBody
      });
      assert.strictEqual(regRes.status, 200, `Registration failed for ${teamName}: ${JSON.stringify(regRes.data)}`);
      assert.strictEqual(regRes.data.memberCount, membersList.length, `Expected memberCount ${membersList.length}`);
      const leaderToken = regRes.setCookie.split('fo_leader_token=')[1]?.split(';')[0];
      assert.ok(leaderToken, 'Expected fo_leader_token cookie');

      // 2. Stage 1: Morse Answer (Advance clock to solve phase, past 300s memorise duration)
      const s1Res = await api('/api/submit', {
        method: 'POST',
        headers: { 'x-mock-now': String(Date.now() + 305000) },
        cookies: { fo_leader_token: leaderToken },
        body: { answer: mission.stage1.answer }
      });
      assert.strictEqual(s1Res.data.success, true, 'Stage 1 answer must be accepted');
      assert.strictEqual(s1Res.data.nextStage, 2);

      // 3. Stage 2: Deterministic Sequence Answer (lowercase required)
      const team = await ds.getTeamByName(teamName);
      const seq = await ds.getTeamSequence(team.id);
      const s2Answer = (seq ? seq.expectedAnswer : mission.stage2.answer).toLowerCase();

      const s2Res = await api('/api/submit', {
        method: 'POST',
        cookies: { fo_leader_token: leaderToken },
        body: { answer: s2Answer }
      });
      assert.strictEqual(s2Res.data.success, true, 'Stage 2 answer must be accepted');
      assert.strictEqual(s2Res.data.nextStage, 3);

      // 4. Stage 3: WARDEN Fragment
      const s3Res = await api('/api/submit', {
        method: 'POST',
        cookies: { fo_leader_token: leaderToken },
        body: { answer: mission.stage3.realFragment }
      });
      assert.strictEqual(s3Res.data.success, true, 'Stage 3 answer must be accepted');
      assert.strictEqual(s3Res.data.nextStage, 4);

      // 5. Stage 4: CTF Tokens Answer
      const s4Res = await api('/api/submit', {
        method: 'POST',
        cookies: { fo_leader_token: leaderToken },
        body: { answer: mission.stage4.answer }
      });
      assert.strictEqual(s4Res.data.success, true, 'Stage 4 answer must be accepted');
      assert.strictEqual(s4Res.data.nextStage, 5);

      // 6. Stage 5: Multi-device member joins for all operatives
      const members = await ds.getMembers(team.id);
      assert.strictEqual(members.length, membersList.length);

      for (const m of members) {
        const opts = {
          method: 'POST',
          body: { teamName, fullName: m.fullName }
        };
        if (m.isLeader === 1) {
          opts.cookies = { fo_leader_token: leaderToken };
        }
        const jRes = await api('/api/join', opts);
        assert.strictEqual(jRes.status, 200, `Member join failed for ${m.fullName}`);
      }

      const finalOverrideCode = computeStage5Override(teamName, members);
      const expectedParts = membersList.length;
      assert.strictEqual(finalOverrideCode.split('-').length, expectedParts, `Expected ${expectedParts}-part code`);

      const s5Res = await api('/api/submit', {
        method: 'POST',
        cookies: { fo_leader_token: leaderToken },
        body: { answer: finalOverrideCode }
      });

      if (!s5Res.data || !s5Res.data.success) {
        console.log('Stage 5 submit debug:', JSON.stringify(s5Res));
      }

      assert.strictEqual(s5Res.data.success, true, 'Stage 5 override code must be accepted');
      assert.strictEqual(s5Res.data.nextStage, 6, 'Stage 5 must advance to Stage 6');

      // 7. Stage 6: Master Final Key
      const { computeFinalKey } = require('../server/logic/finalKey');
      const finalKey = computeFinalKey('NOVA', s2Answer.toUpperCase(), mission.stage3.realFragment, mission.stage4.answer, finalOverrideCode);

      const s6Res = await api('/api/submit', {
        method: 'POST',
        cookies: { fo_leader_token: leaderToken },
        body: { answer: finalKey }
      });

      assert.strictEqual(s6Res.data.success, true, 'Stage 6 master key must be accepted');
      assert.strictEqual(s6Res.data.finished, true, 'Stage 6 must finish the mission');
      assert.ok(s6Res.data.verificationCode, 'Verification code must be present');
      console.log(`✔ Team ${teamName} finished (Verification: ${s6Res.data.verificationCode})`);
    }

    // Launch game via admin
    const launchRes = await api('/api/admin/start-all', {
      method: 'POST',
      headers: { 'x-admin-pin': 'InvictorsAdmin#2026' }
    });
    assert.strictEqual(launchRes.status, 200);

    const runSuffix = Date.now().toString(36);

    // Run 4-player team playthrough
    await simulateTeamPlaythrough({
      teamName: `DryRunSquad4_${runSuffix}`,
      membersList: ['Alice Alpha', 'Bob Beta', 'Charlie Gamma', 'Dave Delta']
    });

    // Run 3-player team playthrough (Member 4 omitted)
    await simulateTeamPlaythrough({
      teamName: `DryRunSquad3_${runSuffix}`,
      membersList: ['Eve Echo', 'Frank Foxtrot', 'Grace Golf']
    });

    const durationMs = Date.now() - startTime;
    console.log(`⏱️ Both dry-runs (4-player and 3-player) completed in ${durationMs} ms`);
    assert.ok(durationMs < 5000, `Dry-run must finish in under 5 seconds, took ${durationMs}ms`);

    console.log('🎉 AUTOMATED 5-STAGE DRY-RUN (3 & 4 PLAYERS) PASSED CLEANLY IN UNDER 5 SECONDS! 🎉');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  runDryRun()
    .catch(err => {
      console.error('❌ Dry-run failure:', err);
      process.exit(1);
    });
}

module.exports = { runDryRun };
