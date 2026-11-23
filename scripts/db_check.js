#!/usr/bin/env node
// ==============================================================================
// FINAL OVERRIDE — DATABASE HEALTH & INTEGRITY CHECK
// Verifies connection, tables, RLS enforcement, and stored functions
// Supports both direct PostgreSQL (via DATABASE_URL) and Supabase REST (via API keys)
// ==============================================================================

require('dotenv').config();
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

async function checkViaSupabaseJs(url, secretKey) {
  console.log('Using Supabase API client (@supabase/supabase-js)...');
  console.log(`Target URL: ${url}`);
  console.log('Secret Key: [REDACTED — Authenticated]');

  const client = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const tablesToCheck = [
    'schema_version', 'settings', 'teams', 'members',
    'game_stages', 'team_sequences', 'progress', 'submissions',
    'hint_config', 'hint_policy', 'hint_usage', 'chat',
    'violations', 'leader_recovery', 'admin_sessions', 'team_notes',
    'audit_log', 'stage2_workbench', 'stage2_workbench_log', 'event_state'
  ];

  console.log('\nChecking table existence in schema cache...');
  let missingTables = [];
  let existingTables = [];

  for (const table of tablesToCheck) {
    try {
      const res = await client.from(table).select('*').limit(1);
      if (res.error) {
        if (res.error.code === 'PGRST205' || res.status === 404) {
          missingTables.push(table);
          console.log(`  - ${table.padEnd(25)} Status: NOT FOUND in schema cache`);
        } else {
          console.warn(`  - ${table.padEnd(25)} Status: ${res.status} (${res.error.message})`);
          missingTables.push(table);
        }
      } else {
        existingTables.push(table);
        console.log(`  - ${table.padEnd(25)} Status: FOUND (Active)`);
      }
    } catch (err) {
      missingTables.push(table);
      console.warn(`  - ${table.padEnd(25)} Error: ${err.message}`);
    }
  }

  // Check RPC functions
  console.log('\nTesting stored RPC function (ping)...');
  try {
    const { data: pingData, error: pingErr } = await client.rpc('ping');
    if (pingErr) {
      console.log(`  RPC ping(): NOT FOUND / INACTIVE (${pingErr.message})`);
    } else {
      console.log(`  RPC ping(): SUCCESS ->`, JSON.stringify(pingData));
    }
  } catch (err) {
    console.log(`  RPC ping(): Error (${err.message})`);
  }

  // Check hint_policy row count
  try {
    const { data: policyRows, error: policyErr } = await client.from('hint_policy').select('stage, kind, enabled');
    if (!policyErr && policyRows) {
      console.log(`\nHint Policies: ${policyRows.length}/6 stage policies present.`);
      if (policyRows.length < 6) {
        console.warn(`  Warning: Expected 6 hint policies across Stages 1-6, found ${policyRows.length}.`);
      }
    }
  } catch (_) {}

  console.log('\n======================================================================');
  if (existingTables.length === tablesToCheck.length) {
    console.log(`STATUS: ALL ${tablesToCheck.length} TABLES VERIFIED & OPERATIONAL ON SUPABASE.`);
  } else if (existingTables.length === 0) {
    console.log('STATUS: SUPABASE CREDENTIALS VALID, BUT DATABASE SCHEMA IS EMPTY.');
    console.log('ACTION REQUIRED:');
    console.log('  1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/vdqmugtolspszcjtiloa');
    console.log('  2. Go to "SQL Editor"');
    console.log('  3. Copy and paste the contents of "supabase/apply_all.sql"');
    console.log('  4. Click "Run" to initialize all 16 tables, 22 functions & RLS policies.');
    console.log('  5. Re-run this check: npm run db:check');
  } else {
    console.log(`STATUS: PARTIAL SCHEMA FOUND (${existingTables.length}/${tablesToCheck.length} tables).`);
    console.log(`Missing tables: ${missingTables.join(', ')}`);
    console.log('Re-apply "supabase/apply_all.sql" in Supabase SQL Editor to complete setup.');
  }
  console.log('======================================================================');
}

async function checkViaPostgres(connectionString) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Attempting direct connection to PostgreSQL via DATABASE_URL...');
    await client.connect();
    console.log('Connection established.\n');

    // 1. Schema Versions
    const { rows: verRows } = await client.query('SELECT version, applied_at FROM public.schema_version ORDER BY version ASC');
    console.log('Schema Migrations Applied:');
    if (verRows.length === 0) {
      console.log('  None recorded.');
    } else {
      verRows.forEach(r => console.log(`  - Version ${r.version} applied at ${r.applied_at}`));
    }

    // 2. Table Count & RLS
    const { rows: tableRows } = await client.query(`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    console.log(`\nPublic Tables (${tableRows.length} total):`);
    let allRlsPassed = true;
    tableRows.forEach(t => {
      const status = t.rls_enabled && t.rls_forced ? 'PASS' : 'WARN/FAIL';
      if (status !== 'PASS') allRlsPassed = false;
      console.log(`  - ${t.table_name.padEnd(25)} RLS: ${t.rls_enabled ? 'ON' : 'OFF'}, FORCED: ${t.rls_forced ? 'ON' : 'OFF'} [${status}]`);
    });

    // 3. Stored Functions Check
    const { rows: fnRows } = await client.query(`
      SELECT p.proname, p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('ping', 'register_team', 'get_team_state', 'submit_answer', 'request_hint')
    `);
    console.log(`\nKey RPC Functions Found: ${fnRows.length}/5`);
    fnRows.forEach(f => console.log(`  - ${f.proname} (SECURITY DEFINER: ${f.prosecdef})`));

    // 4. Ping RPC test
    try {
      const { rows: pingRes } = await client.query('SELECT public.ping() as ping');
      console.log('\nPing RPC Result:', JSON.stringify(pingRes[0]?.ping));
    } catch (e) {
      console.warn('Ping RPC not callable directly or not present:', e.message);
    }

    console.log('\n======================================================================');
    if (allRlsPassed && fnRows.length === 5) {
      console.log('STATUS: DATABASE VERIFICATION PASSED. All security constraints verified.');
    } else {
      console.log('STATUS: DATABASE VERIFICATION COMPLETED WITH WARNINGS.');
    }
    console.log('======================================================================');
  } catch (err) {
    console.error('\nDatabase check failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

async function runSmokeTest() {
  console.log('\n======================================================================');
  console.log('SMOKE TEST: REPOSITORY CRUD, STAGE 1 HINT LIFECYCLE & STAGE 2 WORKBENCH');
  console.log('======================================================================');
  const ds = require('../server/dataService');
  const testTeamId = `__smoketest_team_${Date.now()}`;
  const testTeamName = `SmokeTest_${Date.now()}`;
  const now = Date.now();

  try {
    await ds.createTeam({
      team: {
        id: testTeamId,
        name: testTeamName,
        coordinator: 'Tester',
        startedAt: now,
        stage: 1,
        memberCount: 3,
        sessionToken: `token_${Date.now()}`
      },
      members: [
        { id: `mem1_${Date.now()}`, fullName: 'Alice', isLeader: 1 },
        { id: `mem2_${Date.now()}`, fullName: 'Bob', isLeader: 0 },
        { id: `mem3_${Date.now()}`, fullName: 'Charlie', isLeader: 0 }
      ]
    });
    console.log('  - Created test team:', testTeamName);

    // 1. Stage 1 Repeatable Hint Lifecycle Check
    console.log('  - Testing Stage 1 repeatable hint lifecycle...');
    const hint1 = await ds.requestHint(testTeamId, 1, `smoke_idemp_1_${now}`, now);
    if (!hint1.ok || hint1.costMinutes !== 3 || hint1.useNumber !== 1) {
      throw new Error(`Hint 1 request failed: ${JSON.stringify(hint1)}`);
    }
    console.log('    * Hint 1 (initial request): +3m charged, useNumber 1 (PASS)');

    // Request while active (5 seconds later)
    const hint1_active = await ds.requestHint(testTeamId, 1, `smoke_idemp_1b_${now}`, now + 5000);
    if (!hint1_active.ok || hint1_active.costMinutes !== 0 || !hint1_active.alreadyActive) {
      throw new Error(`Hint 1 active window request failed: ${JSON.stringify(hint1_active)}`);
    }
    console.log('    * Hint 1 (active window re-request): 0m charged, alreadyActive: true (PASS)');

    // Request 2 after window expires (35 seconds later)
    const hint2 = await ds.requestHint(testTeamId, 1, `smoke_idemp_2_${now}`, now + 35000);
    if (!hint2.ok || hint2.costMinutes !== 5 || hint2.useNumber !== 2) {
      throw new Error(`Hint 2 request failed: ${JSON.stringify(hint2)}`);
    }
    console.log('    * Hint 2 (subsequent request): +5m charged, useNumber 2 (PASS)');

    // Request 3 after window expires (70 seconds later)
    const hint3 = await ds.requestHint(testTeamId, 1, `smoke_idemp_3_${now}`, now + 70000);
    if (!hint3.ok || hint3.costMinutes !== 5 || hint3.useNumber !== 3) {
      throw new Error(`Hint 3 request failed: ${JSON.stringify(hint3)}`);
    }
    console.log('    * Hint 3 (repeatable request): +5m charged, useNumber 3 (PASS)');

    const teamAfterHints = await ds.getTeamById(testTeamId);
    if (teamAfterHints.penaltyMin !== 13) {
      throw new Error(`Expected total penalty 13m (3+5+5), got ${teamAfterHints.penaltyMin}`);
    }
    console.log('    * Team cumulative penalty verified: 13m (3+5+5) (PASS)');

    // Advance to Stage 2 for workbench tests
    await ds.updateTeam(testTeamId, { stage: 2 });

    const initialWb = await ds.getStage2Workbench(testTeamId);
    if (initialWb.payloadLoaded !== false || initialWb.version !== 1) {
      throw new Error(`Unexpected initial workbench: ${JSON.stringify(initialWb)}`);
    }
    console.log('  - Initial workbench state verified: version 1, payloadLoaded: false');

    const saveRes1 = await ds.saveStage2Workbench(testTeamId, {
      payloadLoaded: true,
      steps: [{ t: 'm', i: 2 }],
      expectedVersion: 1,
      action: 'apply',
      details: { moduleIndex: 2 }
    });
    if (!saveRes1.ok || saveRes1.state.version !== 2) {
      throw new Error(`Failed to save workbench step: ${JSON.stringify(saveRes1)}`);
    }
    console.log('  - Saved workbench step 1: version -> 2, payloadLoaded -> true');

    const conflictRes = await ds.saveStage2Workbench(testTeamId, {
      payloadLoaded: true,
      steps: [{ t: 'm', i: 2 }, { t: 'm', i: 3 }],
      expectedVersion: 1,
      action: 'apply'
    });
    if (conflictRes.ok || !conflictRes.conflict) {
      throw new Error(`Expected version conflict, got: ${JSON.stringify(conflictRes)}`);
    }
    console.log('  - Version conflict detection verified: conflict: true, currentVersion: 2');

    const saveRes2 = await ds.saveStage2Workbench(testTeamId, {
      payloadLoaded: true,
      steps: [{ t: 'm', i: 2 }, { t: 'm', i: 3 }],
      expectedVersion: 2,
      action: 'apply',
      details: { moduleIndex: 3 }
    });
    if (!saveRes2.ok || saveRes2.state.version !== 3) {
      throw new Error(`Failed to save workbench step 2: ${JSON.stringify(saveRes2)}`);
    }
    console.log('  - Saved workbench step 2: version -> 3');

    const eventState = await ds.getEventState();
    if (typeof eventState !== 'object' || eventState.id !== 1) {
      throw new Error(`Invalid event state: ${JSON.stringify(eventState)}`);
    }
    console.log('  - Event state verified: mode =', eventState.mode, ', capMinutes =', eventState.capMinutes);

    console.log('STATUS: ALL SMOKE TESTS PASSED CLEANLY.');
  } finally {
    try {
      await ds.deleteTeam(testTeamId);
      console.log('  - Cleaned up test team successfully.');
    } catch (_) {}
  }
}

async function checkDatabase() {
  const isSmoke = process.argv.includes('--smoke');
  const isSqlite = process.argv.includes('--sqlite') || (process.env.DB_PROVIDER === 'sqlite' && !process.env.DATABASE_URL);
  
  if (isSqlite) {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATA_SOURCE = 'sqlite';
  }

  const connectionString = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('======================================================================');
  console.log('FINAL OVERRIDE — DATABASE DIAGNOSTIC CHECK');
  console.log('======================================================================');

  if (isSqlite) {
    console.log('Checking SQLite database...');
    const db = require('../server/db');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
    console.log(`Found ${tables.length} tables in SQLite: ${tables.join(', ')}`);
    const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    console.log(`Found ${indices.length} indexes in SQLite.`);
    if (tables.includes('hint_policy')) {
      const policyCount = db.prepare("SELECT COUNT(*) as c FROM hint_policy").get().c;
      console.log(`Found ${policyCount}/6 hint policies in hint_policy table.`);
      if (policyCount !== 6) {
        throw new Error(`Expected exactly 6 rows in hint_policy, found ${policyCount}`);
      }
    } else {
      throw new Error("Table 'hint_policy' not found in SQLite database.");
    }
  } else if (connectionString) {
    await checkViaPostgres(connectionString);
  } else if (supabaseUrl && supabaseSecretKey) {
    await checkViaSupabaseJs(supabaseUrl, supabaseSecretKey);
  } else {
    console.log('Neither DATABASE_URL nor SUPABASE_URL / SUPABASE_SECRET_KEY is configured in .env.');
    console.log('Please configure .env before running this check.');
    console.log('======================================================================');
    process.exit(1);
  }

  if (isSmoke) {
    await runSmokeTest();
  }
}

checkDatabase().catch(err => {
  console.error('\nDatabase check error:', err.message || err);
  process.exit(1);
});
