# FINAL OVERRIDE — Deployment & Operations Guide

## 1. Supported Deployment Modes

### Primary Mode: Local Area Network (LAN) Monolith
**FINAL OVERRIDE** is primarily designed and certified for **single-instance LAN on-premise execution** running on a central venue control laptop or local server.
- **Why LAN?**: University campus competitions frequently face external internet latency, throttling, or captive portal blocks. An on-premise Node.js instance with `better-sqlite3` operating in WAL mode runs 100% offline with zero external dependencies.
- **Serverless Incompatibility**: Serverless platforms (e.g. AWS Lambda, Vercel) spin up ephemeral stateless containers. In-memory locks (`LockService`), query caches (`QueryCache`), event loop telemetry (`LoadShedder`), and local file-based SQLite do NOT persist across serverless invocations.

### Cloud Backend Mode: Supabase PostgreSQL
For distributed or multi-room deployments where a centralized cloud database is required, FINAL OVERRIDE provides a hardened Supabase adapter implementing Row Level Security (RLS) and stored procedures.

---

## 2. Quickstart & Deployment Steps

### Prerequisites
- Node.js version 20+ (Node v20.x, v22.x, or v26.x supported).
- Local venue WiFi router or Ethernet switch connecting player laptops and coordinator stations.

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Environment Configuration
Copy `.env.example` to `.env` and fill in secrets and event parameters.

> [!CAUTION]
> Never commit real secrets to version control or share `.env` files. Keep `.env.example` populated with blank values only.

Sample `.env`:
```ini
NODE_ENV=production
PORT=3000

# Database selection: "sqlite" or "supabase"
DATA_SOURCE=sqlite
DB_PATH=data/final_override.db

# Security & Event Tokens (Fill in your own strong values)
ADMIN_PIN=
EVENT_SALT=
SHARD_SECRET=
COORDINATORS=Arun,Divya,Kiran,Pooja,Rakshith
COORDINATOR_PINS=

# Optional Supabase Configuration (When DATA_SOURCE=supabase)
SUPABASE_URL=https://vdqmugtolspszcjtiloa.supabase.co
SUPABASE_SECRET_KEY=
DATABASE_URL=

# Game Rules & Timing
TIME_CAP_MINUTES=90
TIME_CAP_ENFORCED=false
TAB_PENALTY_ENABLED=true
TAB_PENALTY_MINUTES=1
```

### Step 3: Database Initialization
For SQLite:
```bash
npm run migrate
```
For Supabase:
Apply `supabase/apply_all.sql` in the Supabase Dashboard SQL Editor, or run:
```bash
npm run db:migrate
npm run db:check
```

### Step 4: Run Pre-Flight Integrity Suite
Before opening the competition to players, execute the test suites:
```bash
npm run lint           # Static code and security analysis
npm test               # All 22 acceptance tests and repository contracts
npm run content:check  # Validates mission.json content across all 6 stages
npm run test:browser   # Validates browser DOM, 4-box keyboard navigation, and stages
npm run loadtest       # Concurrency benchmark for 150 teams (600 operatives)
```

### Step 5: Start the Mission Server
```bash
npm start
```
The server will bind to `0.0.0.0:3000`. Broadcast the host machine's LAN IP (e.g. `http://192.168.1.100:3000`) to players and coordinators.

---

## 3. Competition Operations Checklist

### Pre-Event
1. **Mission Configuration**: Confirm `server/content/mission.json` matches the intended puzzle solutions, sector light timings, and machine names.
2. **Coordinators**: Confirm coordinator names and 6-digit access PINs in `.env`.
3. **Staging Lobby**: Keep `startTogetherMode` set to `true`. Registered teams will wait in the Mission Briefing Lobby until the administrator launches the game.

### Event Day Operations
1. **Launch Mission**: Admin visits `/admin`, enters `ADMIN_PIN`, and clicks **Launch All Squads**. All teams advance to Stage 1 Phase 1 synchronously.
2. **Stage 1 Flow**: Teams spend their first 60 seconds memorising the 15-letter Morse code reference table. After 60 seconds, the chart closes and sector solver inputs unlock.
3. **Coordinator Desk**: Coordinators monitor assigned squads at `/coordinator` to verify physical attendance, assist with hardware issues, and inspect anti-tamper tab penalties.
4. **Leader Session Recovery**: If a team leader clears browser cache or changes laptops, Admin generates a single-use 6-digit recovery code at `/admin` -> **Reissue Leader Token**.
5. **Leaderboard Freeze**: Prior to the final moments, Admin toggles **Freeze Leaderboard** to obscure live ranks for the award ceremony.
