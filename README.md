# FINAL OVERRIDE — Invictors Club Escape-Room Tech Challenge

> **"INVICTORS CLUB PRESENTS · Decode. Innovate. Overcome."**  
> *Department of Computer Science & Engineering, Vidyavardhaka College of Engineering (VVCE), Mysuru.*

---

## 📌 Executive Overview

**FINAL OVERRIDE** is an escape-room style competitive technical challenge engineered for collegiate hackathons and tech fests. Squads of 3 to 4 operatives compete against a live countdown clock to unlock a locked-down laboratory vault. Operatives solve sequential cryptographic, signal analysis, prompt engineering, and web security puzzles, synchronize their physical devices, and assemble an integrity-checked master override key.

---

## 🏛️ System Architecture & Supported Backends

### Mode A: Local Area Network (LAN) Monolith (Primary & Event-Certified)
- **Runtime**: Node.js `>= 20` (tested on Node 20 LTS, Node 22, and Node 26).
- **Database**: Local SQLite via `better-sqlite3` and `node:sqlite` (`server/sqliteAdapter.js`). High-performance Write-Ahead Logging (WAL) mode enabled (`PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA busy_timeout = 5000`, `PRAGMA cache_size = -64000`).
- **Server**: Express 5 listening on local network interface (`0.0.0.0`).
- **Client Architecture**: Modular vanilla JavaScript with native ES Modules (`public/js/views/`). Zero bundlers, zero external CDNs, zero third-party font/script downloads.
- **State & Timers**: Server-authoritative clocks and state synchronization.

> [!IMPORTANT]
> **LAN Deployment Notice:** Serverless/Vercel deployment is **unsupported for live event day operations**. Serverless execution cannot maintain persistent in-memory rate limiters, per-team mutexes, or background rolling backup jobs. Deploy on a dedicated laptop or local server connected to the venue LAN/Wi-Fi.

### Mode B: Cloud PostgreSQL with Supabase (Multi-Hub / Distributed Events)
- Fully hardened database adapter (`server/repositories/supabaseRepository.js`) matching 100% of the SQLite contract.
- 16 normalized tables with Row Level Security (RLS) enabled on every table.
- 22 `SECURITY DEFINER` stored procedures executing with empty `search_path = ''` to protect against search_path hijacking.
- Automated migration and security verification tooling (`npm run db:migrate` and `npm run db:check`).

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: Version 20 or higher (`node -v`).
- **Git**

### 2. Installation
```bash
git clone https://github.com/Anish-S-Kumar/Final_Override.git
cd Final_Override
npm install
```

### 3. Secrets & Mission Configuration
Copy the sample configuration file:
```bash
cp .env.example .env
```

1. Edit `.env` to configure event secrets (see [Environment Variables](#-environment-variables)). Keep real secrets out of git.
2. Edit `server/content/mission.json` to define or customize your event's secret puzzle answers, cipher layers, tokens, and access phrases.
3. Validate mission content:
```bash
npm run content:check
```

### 4. Verification & Integrity Suite
Execute the full suite of automated verifications:
```bash
npm run lint          # Validate code syntax and security rules
npm test              # Run all 22 acceptance tests & repository contracts
npm run content:check # Validate mission content across all 6 stages
npm run test:browser  # End-to-end browser DOM, 4-box keyboard nav & stage tests
npm run loadtest      # Concurrency benchmark for 150 teams (600 operatives)
```

### 5. Launch the Server
```bash
npm start
```
The console will display the local and LAN URLs for participants, coordinators, and the master administrator.

---

## ⚙️ Environment Variables

All configuration is managed through environment variables in `.env`:

| Variable | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `PORT` | Number | No | HTTP port (default: `3000`). |
| `DATA_SOURCE` | String | No | Database engine: `sqlite` (default) or `supabase`. |
| `DB_PATH` | String | No | Filesystem path for SQLite database file (default: `data/final_override.db`). |
| `SUPABASE_URL` | String | Conditional | Supabase project API URL (required if `DATA_SOURCE=supabase`). |
| `SUPABASE_SECRET_KEY` | String | Conditional | Supabase service role secret key (required if `DATA_SOURCE=supabase`). |
| `ADMIN_PIN` | String | **Yes** | Master Organiser PIN (min 8 chars; cannot be default). |
| `EVENT_SALT` | String | **Yes** | Cryptographic salt for answer hashing (min 16 chars; cannot be default). |
| `SHARD_SECRET` | String | **Yes** | HMAC secret key for Stage 5 member shards and completion verification codes. |
| `COORDINATORS` | String | **Yes** | Comma-separated list of coordinator full names (e.g., `Arun,Divya,Kiran`). |
| `COORDINATOR_PINS` | String | **Yes** | Comma-separated list of coordinator PINs matching each coordinator (min 6 chars each). |
| `MIN_TEAM_SIZE` | Number | No | Minimum registered operatives per team (default: `3`). |
| `MAX_TEAM_SIZE` | Number | No | Maximum registered operatives per team (default: `4`). Member 4 is optional. |
| `TIME_CAP_MINUTES` | Number | No | Event duration limit in minutes (default: `90`). |
| `TIME_CAP_ENFORCED` | Boolean | No | Reject submissions and mark teams timed out when cap expires (`true`/`false`, default: `false`). |
| `TAB_PENALTY_MINUTES`| Number | No | Penalty minutes added per anti-cheat tab switch violation (default: `1`). |
| `TAB_PENALTY_ENABLED`| Boolean | No | Enable anti-cheat tab-switch tracking (`true`/`false`, default: `true`). |
| `WARDEN_MODE` | String | No | AI engine for Stage 3: `rules` (deterministic rule engine, default) or `llm`. |
| `OPENAI_API_KEY` | String | No | Optional API key when running WARDEN in `llm` mode. |

---

## 🧩 The 6 Challenge Stages

All stage data, puzzle answers, and cipher texts are dynamically driven by `server/content/mission.json`:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. SIGNAL       │ ──> │  2. DECODING     │ ──> │  3. PROMPT AI    │
│  Morse Matrix    │     │  Layered Ciphers │     │  WARDEN Guardian │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  6. INTEGRATION  │ <── │  5. TEAM SYNC    │ <── │  4. CTF FLAGS    │
│  Master Override │     │  HMAC Shards     │     │  Terminal & Web  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

1. **Stage 1 — Signal Intercept & Morse Matrix**:
   - **Phase 1 (Memorise — 60s)**: Teams study a 15-letter Morse code reference table while sector data and solver controls remain locked and unserved by the server.
   - **Phase 2 (Solve)**: Morse chart closes and 2x2 sector cards unlock:
     - *Sector 1 (Pulse Signal)*: Dash + Dot chips showing Morse `— •` (`N`).
     - *Sector 2 (Binary Code)*: Binary stream `111-0-111-0-111` with rule `111 = Dash`, `0 = Space`, 3 Dash chips showing Morse `— — —` (`O`).
     - *Sector 3 (Blinking Light Beacon)*: Flashes 3 short blinks and 1 long blink (`• • • —`, `V`). Configured with 600ms base unit, 800ms lead-in silence, 1.5x slow speed toggle, and Decoy Trap Alert (`ZETA9`).
     - *Sector 4 (Satellite Signal)*: Dot + Dash chips showing Morse `• —` (`A`).
   - Solvers enter the 4-letter vault code (`NOVA`) via 4 single-letter input boxes featuring auto-advance, backspace navigation, and paste distribution.

2. **Stage 2 — Decoding Matrix**:
   - Multi-layer nested transposition and substitution cipher (Base64 $\rightarrow$ Hexadecimal $\rightarrow$ ROT13).
   - Interactive Cryptanalyst Workbench with Base64, Hex, ROT13, Atbash, Reverse, and Caesar Shift modules.
   - Per-team sequence order derived deterministically from team seed. Lowercase answer submission strictly required.
   - Unlocks Fragment 2 and the WARDEN security access phrase.

3. **Stage 3 — Prompt AI (WARDEN)**:
   - Rule-based deterministic AI guardian guarding Fragment 3.
   - Validates that operatives state their role, provide the access phrase discovered in Stage 2, and formulate an operational directive in complete sentences. Rejects casual prompts and decoy fragment requests.

4. **Stage 4 — CTF Challenges**:
   - Simulated sandboxed virtual shell (`help`, `ls`, `cat`, `exif`) with traversal protection (`..`, leading `/`, `\`).
   - Three hidden tokens across web comments, hidden endpoints, and image metadata combine to form Fragment 4.

5. **Stage 5 — Team Sync & Multi-Device HMAC Link**:
   - Mandates all squad operatives (3 or 4 members) join from their own laptops via `/join` using their team name.
   - Distributes cryptographic HMAC shards to each connected device.
   - Solvers assemble the combined shards in registration order separated by hyphens (`SHARD1-SHARD2-SHARD3` or `SHARD1-SHARD2-SHARD3-SHARD4`) to advance to Stage 6.

6. **Stage 6 — Final Integration & Master Override**:
   - Synthesis matrix displays all 5 recovered sector fragments (`f1` through `f5`).
   - Solvers compute the master clearance formula:
     $$\text{Master Key} = \text{FO}\{f4-f2-f1-\text{rev}(f3)-f5\_\text{no\_dashes}\}\#\text{digitSum}$$
   - Successful execution unlocks the vault, records the official finish timestamp, and generates an HMAC-backed verification code.

---

## 🛡️ Security & Anti-Cheat Features

- **XSS & Injection Protection**: Strict input sanitization rejecting `<`, `>`, and control characters at registration, paired with DOM-level escaping (`esc()` and `setText()`) across all views.
- **Member 4 Optionality**: Supports 3 or 4 operatives per team. Member 4 has no required attribute and validates cleanly without errors when omitted.
- **Anti-Cheat Tab Switching**: Uses `visibilitychange` only, debounced to 5 seconds, capped at 3 violations per stage and 10 per team, with a 3-second grace period after stage transitions. Stage 4 is exempt from penalties.
- **Timing-Safe Authentication**: Admin and Coordinator PIN comparisons use `crypto.timingSafeEqual` with brute-force rate limiters (5 failed attempts per IP per 10 minutes $\rightarrow$ 429).
- **Session Recovery**: Organisers can reissue lost leader sessions via a single-use 6-digit recovery code valid for 10 minutes (`/api/admin/team/:id/reissue-leader`), allowing squads to resume without lost progress.
- **Automated Backups**: Background service automatically creates timestamped SQLite snapshots in `data/backups/` every 5 minutes while pruning older archives.
- **Accidental Wipe Protection**: Database reset scripts (`npm run seed` and `scripts/wipe_database.js`) strictly refuse execution without explicit confirmation (`--yes` flag or interactive confirmation).

---

## 📋 Organiser Event-Day Runbook

### Pre-Event Setup
1. **Initialize Database**:
   ```bash
   npm run seed -- --yes
   ```
2. **Start Mission Server**:
   ```bash
   npm start
   ```
3. **Generate Admin Guide**:
   ```bash
   node scripts/generate_admin_guide_pdf.js
   ```
   Print or distribute the generated confidential organizer guide to authorized judges and coordinators.

### Launching the Event
1. Instruct squads to navigate to `http://<LAN-IP>:3000` and register their team name, coordinator, and operatives.
2. Teams enter the synchronized waiting lobby.
3. Once all squads are checked in, the Master Organiser logs into `/admin` and clicks **"Launch All Teams"**. The timer starts and all squads advance to Stage 1 Phase 1 simultaneously.

### Live Event Management
- **Leaderboard Freeze**: During the final minutes of the competition, organizers can toggle **"Freeze Board"** from `/admin`. Public screens show the frozen snapshot, building suspense for the award ceremony.
- **Dispute Resolution**: Raw submission attempts and anti-cheat violation logs are viewable in `/admin`.
- **Exporting Standings**: Download official audit results anytime via **Export CSV** (`/api/admin/export.csv`) or **Export JSON** (`/api/admin/export.json`).

---

## 📜 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm start` | Launches the server in production mode. |
| `npm test` | Executes all 22 acceptance tests and repository contracts. |
| `npm run test:browser` | End-to-end browser DOM, 4-box keyboard nav & stage tests. |
| `npm run lint` | Validates syntax, linting, and security rules across all modules. |
| `npm run content:check` | Validates `mission.json` content integrity across all 6 stages. |
| `npm run loadtest` | Benchmarks concurrency across 150 teams (600 operatives). |
| `npm run dryrun` | Simulates an entire team run-through from Stage 1 to 6 in $< 5\text{s}$. |
| `npm run db:migrate` | Runs PostgreSQL migrations against the configured Supabase database. |
| `npm run db:check` | Verifies Supabase schema, RLS policies, and stored procedure health. |
| `npm run seed -- --yes` | Clears all team data and resets settings for a new event. |

---

## 👥 Invictors Club Leadership & Credits

- **Department**: Computer Science & Engineering, Vidyavardhaka College of Engineering, Mysuru.
- **Instagram**: [@theinvictors.vvce](https://instagram.com/theinvictors.vvce)
- **Email**: invictorsofficial@gmail.com
- **Website**: [https://invictors-vvce.vercel.app/](https://invictors-vvce.vercel.app/)

*Designed and engineered with passion for student technical excellence.*
