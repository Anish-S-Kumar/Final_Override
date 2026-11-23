// ==============================================================================
// FINAL OVERRIDE — REPOSITORY CONTRACT ACCEPTANCE TEST
// Verifies that repository implementations fulfill the complete storage contract
// ==============================================================================

const assert = require('assert');
const sqliteRepo = require('../repositories/sqliteRepository');
const SupabaseRepository = require('../repositories/supabaseRepository');

async function testRepositoryContract(repoName, repo) {
  console.log(`\nTesting Repository Contract for: ${repoName}...`);

  const uniqueId = `contract_team_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const testTeam = {
    id: uniqueId,
    name: `Contract Team ${uniqueId}`,
    coordinator: 'Arun',
    startedAt: Date.now(),
    sessionToken: `tok_${uniqueId}`,
    status: 'active',
    seed: 'seed123',
    memberCount: 3
  };

  const testMembers = [
    { id: `${uniqueId}_m1`, teamId: uniqueId, fullName: 'Alice Smith', isLeader: 1 },
    { id: `${uniqueId}_m2`, teamId: uniqueId, fullName: 'Bob Jones', isLeader: 0 },
    { id: `${uniqueId}_m3`, teamId: uniqueId, fullName: 'Charlie Brown', isLeader: 0 }
  ];

  // 1. Settings Contract
  console.log('  - Checking settings methods...');
  await repo.setSetting(`test_setting_${uniqueId}`, 'contract_val');
  const val = await repo.getSetting(`test_setting_${uniqueId}`);
  assert.strictEqual(val, 'contract_val', 'getSetting should return set value');

  // 2. Team Creation & Retrieval Contract
  console.log('  - Checking team creation and lookup...');
  await repo.createTeam({ team: testTeam, members: testMembers, stages: 6 });

  const fetchedById = await repo.getTeamById(uniqueId);
  assert(fetchedById, 'getTeamById should find team');
  assert.strictEqual(fetchedById.name, testTeam.name);
  assert.strictEqual(fetchedById.memberCount, 3);

  const fetchedByToken = await repo.getTeamByToken(testTeam.sessionToken);
  assert(fetchedByToken, 'getTeamByToken should find team');
  assert.strictEqual(fetchedByToken.id, uniqueId);

  const fetchedByName = await repo.getTeamByName(testTeam.name);
  assert(fetchedByName, 'getTeamByName should find team');

  // 3. Members Contract
  console.log('  - Checking members methods...');
  const members = await repo.getMembers(uniqueId);
  assert.strictEqual(members.length, 3, 'Should have exactly 3 members');
  const leader = members.find(m => m.isLeader === 1 || m.isLeader === true);
  assert(leader, 'Should have a leader');

  // 4. Progress Contract
  console.log('  - Checking progress tracking...');
  const progress = await repo.getProgress(uniqueId);
  assert.strictEqual(progress.length, 6, 'Should have 6 stages in progress');

  await repo.updateProgress(uniqueId, 1, { wrongAttempts: 2 });
  const p1 = await repo.getProgressForStage(uniqueId, 1);
  assert.strictEqual(p1.wrongAttempts, 2, 'wrongAttempts should be updated');

  // 5. Submissions Contract
  console.log('  - Checking submissions...');
  await repo.addSubmission({
    teamId: uniqueId,
    stage: 1,
    valueHash: 'hash1',
    rawValue: 'NOVA',
    ok: 1,
    at: Date.now()
  });
  const subs = await repo.getSubmissions(uniqueId);
  assert(subs.length >= 1, 'Should record submission');
  assert.strictEqual(subs[0].rawValue, 'NOVA');

  // 6. Violations Contract
  console.log('  - Checking violations...');
  await repo.addViolation({
    teamId: uniqueId,
    stage: 1,
    type: 'tab_switch',
    details: 'User blurred window',
    penaltyAdded: 0,
    at: Date.now()
  });
  const violsCount = await repo.getTabViolationsCount(uniqueId);
  assert.strictEqual(violsCount, 1, 'Tab switch count should be 1');

  // 7. Hint Policy, Config & Usage Contract
  console.log('  - Checking hint configurations and policies...');
  const hintConfigs = await repo.getAllHintConfigs();
  assert(hintConfigs.length > 0, 'Should have hint configurations');
  const stage1Policy = await repo.getHintPolicy(1);
  assert(stage1Policy, 'Should find hint policy for stage 1');
  assert.strictEqual(stage1Policy.stage, 1);
  const h2_1 = await repo.getHintConfig(2, 1);
  assert(h2_1, 'Should find hint 1 for stage 2');

  await repo.recordHintUsage({
    teamId: uniqueId,
    stage: 1,
    hintId: 'stage_1_chart',
    hintNumber: 1,
    penaltyCharged: 3,
    shownAt: Date.now(),
    visibleUntil: Date.now() + 30000
  });
  const hintUsage = await repo.getHintUsage(uniqueId, 1);
  assert.strictEqual(hintUsage.length, 1, 'Should record hint usage');

  // 8. Cleanup
  console.log('  - Cleaning up test data...');
  await repo.deleteTeam(uniqueId);
  const deleted = await repo.getTeamById(uniqueId);
  assert(!deleted, 'Team should be deleted');

  console.log(`✅ ${repoName} passed all contract checks!`);
}

async function runContractTests() {
  console.log('======================================================');
  console.log('RUNNING REPOSITORY CONTRACT TESTS');
  console.log('======================================================');

  // Test SQLite Repository
  await testRepositoryContract('SQLite Repository', sqliteRepo);

  // Check Supabase Repository class structure
  console.log('\nValidating Supabase Repository structure...');
  const sbRepo = new SupabaseRepository();
  const expectedMethods = [
    'getSetting', 'getAllSettings', 'setSetting',
    'getTeamByToken', 'getTeamById', 'getTeamByName', 'getAllTeams', 'getWaitingTeamsCount',
    'createTeam', 'updateTeam', 'deleteTeam', 'addPausedMsToActiveTeams',
    'startAllTeams', 'restartAllTeams', 'resetTeam',
    'getMembers', 'getMemberById', 'updateMember', 'getMembersForTeams',
    'getMemberByDeviceToken', 'assignDeviceToken', 'resetMemberDevice', 'resetAllMemberDevices',
    'getTeamSequence', 'setTeamSequence',
    'getProgress', 'getProgressForStage', 'getProgressForTeams', 'resetTeamProgress', 'updateProgress',
    'addSubmission', 'getSubmissions', 'getAllSubmissions',
    'addViolation', 'getViolations', 'getAllViolations', 'getTabViolationsCount', 'getLastTabViolation', 'deleteViolation',
    'addChat', 'getChat', 'getChatHistory', 'getRecentChatCount', 'getRecentWardenLogs',
    'getAllHintConfigs', 'getHintConfig', 'updateHintConfig', 'getHintUsage', 'recordHintUsage',
    'createRecoveryCode', 'getRecoveryCode', 'markRecoveryCodeUsed',
    'addAuditLog', 'getAuditLogs'
  ];

  for (const m of expectedMethods) {
    assert(typeof sbRepo[m] === 'function', `SupabaseRepository must implement ${m}()`);
  }
  console.log(`✅ Supabase Repository implements all ${expectedMethods.length} contract methods!`);

  console.log('\n======================================================');
  console.log('ALL REPOSITORY CONTRACT TESTS PASSED');
  console.log('======================================================\n');
}

if (require.main === module) {
  runContractTests().catch(err => {
    console.error('Contract test failed:', err);
    process.exit(1);
  });
}

module.exports = { runContractTests };
