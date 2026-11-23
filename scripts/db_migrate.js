#!/usr/bin/env node
// ==============================================================================
// FINAL OVERRIDE — DATABASE MIGRATION RUNNER
// Applies SQL migrations from supabase/migrations/ in sequential order
// ==============================================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('----------------------------------------------------------------------');
    console.log('FINAL OVERRIDE — DATABASE MIGRATION RUNNER');
    console.log('----------------------------------------------------------------------');
    console.log('INFO: DATABASE_URL is not set in environment or .env.');
    console.log('To migrate a remote PostgreSQL / Supabase database, you can:');
    console.log('  1. Copy the contents of "supabase/apply_all.sql" and run it in the');
    console.log('     Supabase Dashboard -> SQL Editor (Recommended for IPv4/IPv6 compatibility).');
    console.log('  2. Set DATABASE_URL in .env using the Supabase Connection Pooler');
    console.log('     (Session mode, port 5432) and run "npm run db:migrate".');
    console.log('----------------------------------------------------------------------');
    process.exit(0);
  }

  console.log('Connecting to PostgreSQL database...');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully.\n');

    // Ensure schema_version table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
    `);

    // Fetch applied versions
    const { rows } = await client.query('SELECT version FROM public.schema_version ORDER BY version ASC');
    const appliedVersions = new Set(rows.map(r => r.version));

    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files in supabase/migrations/`);

    for (const file of files) {
      const versionMatch = file.match(/^(\d+)_/);
      const version = versionMatch ? parseInt(versionMatch[1], 10) : null;

      if (version === null) {
        console.warn(`Skipping unversioned migration file: ${file}`);
        continue;
      }

      if (appliedVersions.has(version)) {
        console.log(`  [OK] Migration ${file} already applied (version ${version}).`);
        continue;
      }

      console.log(`  [APPLYING] Migration ${file} (version ${version})...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_version (version, applied_at) VALUES ($1, clock_timestamp()) ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp()',
          [version]
        );
        await client.query('COMMIT');
        console.log(`  [DONE] Migration ${file} applied successfully.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [FAILED] Migration ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log('\nAll migrations completed successfully.');
  } catch (err) {
    console.error('\nDatabase migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigrations();
