# FINAL OVERRIDE — Database Architecture & Setup Guide

This document describes how to configure and operate the database layer for **FINAL OVERRIDE** (Escape-Room Tech Challenge for Invictors Club, VVCE Mysuru).

The system supports two database backends selected via the `DATA_SOURCE` environment variable:
1. **SQLite (better-sqlite3)**: The primary, production-tested mode for offline LAN campus competitions.
2. **Supabase (PostgreSQL)**: Supported cloud backend for centralized scoring, real-time replication, and multi-hub events.

---

## 1. Option A: SQLite (Local LAN Mode — Recommended for Venue Competitions)

SQLite is zero-configuration and runs completely offline with zero internet dependency.

### Key Architecture Features
- **Write-Ahead Logging (WAL)**: Initialized with `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`, and `PRAGMA busy_timeout = 5000;`. Enables high-concurrency non-blocking reads during rapid state polling.
- **In-Memory Cache**: 64 MB database page cache (`PRAGMA cache_size = -64000;`) keeps working hot data in RAM.
- **Foreign Key Enforcement**: `PRAGMA foreign_keys = ON;`.
- **Automatic Initialization**: On server boot (`npm start`), if the database file does not exist, `server/db.js` automatically creates all 16 tables, performance indexes, and default settings.

### Setup Instructions
1. Ensure your `.env` contains:
   ```env
   DATA_SOURCE=sqlite
   DB_PATH=data/final_override.db
   ```
2. (Optional) Initialize or re-run migrations manually:
   ```bash
   npm run migrate
   ```
3. To seed test teams or wipe between rehearsals:
   ```bash
   npm run seed    # Seeds sample squads (Team Alpha, Team Beta, etc.)
   npm run wipe    # Clears all runtime tables while preserving schema
   ```

---

## 2. Option B: Supabase (Cloud PostgreSQL Mode)

Supabase provides enterprise PostgreSQL with Row Level Security (RLS) and stored procedures.

### Supabase Project Details
- **Project Name**: Final Overide
- **Project Ref**: `vdqmugtolspszcjtiloa`
- **API URL**: `https://vdqmugtolspszcjtiloa.supabase.co`

### Schema & Security Architecture
All migrations are located in the `supabase/` directory:
- `supabase/migrations/001_initial_schema.sql`: 16 normalized tables matching the SQLite contract.
- `supabase/migrations/002_game_functions.sql`: 22 stored procedures (`advance_team_stage`, `record_submission_attempt`, etc.) defined with `SECURITY DEFINER` and empty `search_path = ''` to prevent search_path hijacking.
- `supabase/migrations/003_security_policies.sql`: Enables Row Level Security (RLS) on all 16 tables with `FORCE ROW LEVEL SECURITY`. Revokes public permissions, denies `anon` and `authenticated` roles, and restricts access strictly to the backend `service_role`.
- `supabase/migrations/004_performance_indexes.sql`: B-Tree indexes on lookup keys, foreign keys, and leaderboard order columns.

### Setup Instructions

#### Method 1: Supabase Dashboard SQL Editor (Recommended)
Because some local campus networks restrict direct IPv4/IPv6 pooling ports to cloud databases, running the complete consolidated migration script in the Supabase Dashboard SQL Editor is the fastest, most reliable method:
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard/project/vdqmugtolspszcjtiloa).
2. Navigate to **SQL Editor** in the left sidebar.
3. Open `supabase/apply_all.sql` in your text editor, copy its contents, and paste them into the SQL Editor.
4. Click **Run**.
5. All 16 tables, functions, RLS policies, and indexes will execute transactionally.

#### Method 2: CLI Migration Tool
If your host machine has direct network access to the database pooler:
```bash
npm run db:migrate
```
This script executes `supabase/apply_all.sql` directly against the database pooler.

### Verifying Database Integrity & Security
Run the automated schema and security validator:
```bash
npm run db:check
```
The check tool connects to Supabase, validates that all 16 tables exist, verifies that RLS is active and enforced on every table, confirms all 22 stored procedures are present, and checks that anonymous access is completely blocked.

---

## 3. Environment Variables Configuration

In `.env`, set the database configuration:
```env
# Database Mode: "sqlite" or "supabase"
DATA_SOURCE=sqlite

# SQLite Configuration (Used when DATA_SOURCE=sqlite)
DB_PATH=data/final_override.db

# Supabase Configuration (Used when DATA_SOURCE=supabase)
SUPABASE_URL=https://vdqmugtolspszcjtiloa.supabase.co
SUPABASE_SECRET_KEY=
DATABASE_URL=
```

> [!CAUTION]
> Never commit `.env` files or paste secret service role keys into public repositories or version control. Use `.env.example` as a template with blank values only.

---

## 4. Database Contract Parity

Both `server/repositories/sqliteRepository.js` and `server/repositories/supabaseRepository.js` adhere strictly to the shared repository interface:
- All 54 repository methods are implemented with identical parameter signatures and return types.
- The contract test suite (`server/tests/repository.contract.test.js`) runs during `npm test` to guarantee 100% functional parity between SQLite and Supabase.
- Timeout protection (8-second maximum) and query error sanitization prevent orphaned connections.
