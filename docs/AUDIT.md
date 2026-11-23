# FINAL OVERRIDE — System Architecture & Forensic Audit

**Audit Date:** 2026-11-21  
**Target Application:** FINAL OVERRIDE (Invictors Club, VVCE Mysuru)  
**Host Environment:** Windows with PowerShell, Node.js 20+  
**Repository Working Directory:** `c:\Users\lenovo\OneDrive\Desktop\Invictors-main` (Active inside OneDrive synced directory)  
**Safety Backup Path:** `C:\Users\lenovo\final_override_backup_20261121` (Outside repository & outside OneDrive)

---

## 1. Executive Summary

This audit establishes the baseline architectural state, credential handling posture, data models, stage progression logic, and discrepancies across the FINAL OVERRIDE repository prior to Supabase migration, Stage 1 remediation, and UI redesign.

Key findings:
1. **Database Architecture:** The active backend currently runs against SQLite (`server/repositories/sqliteRepository.js` via `better-sqlite3`). The Supabase repository (`server/repositories/supabaseStub.js`) was an inactive stub that threw on instantiation. A new empty Supabase project (`https://vdqmugtolspszcjtiloa.supabase.co`, ref `vdqmugtolspszcjtiloa`) has been created by the owner to replace the obsolete, unreachable legacy Supabase and Vercel backends.
2. **Stage Progression & Structure:** A previous automated pass collapsed the game into 5 stages under an unverified assumption. Historical git evidence (`e73ef84`) confirms the game was originally authored with **six distinct stages**:
   - Stage 1: Signal Intercept (Morse Matrix)
   - Stage 2: Decoding (Layered Cryptanalysis)
   - Stage 3: Prompt the AI (Neural WARDEN)
   - Stage 4: CTF Challenges (Terminal & Token Infiltration)
   - Stage 5: Team Sync (Multi-Device HMAC Shards)
   - Stage 6: Final Integration (Master Key Derivation)
   The project must preserve all six stages as mandated by Ground Rule 7.
3. **Environment & Secrets:** Working tree and git history scans identified historical commits containing literal default credentials (`INVICTORS@23`, `INVICTORS`), fallback salts (`final_override_secure_salt_vvce_998877`), and Vercel artifacts. `.env` is properly ignored by git via `.gitignore:2:.env`.
4. **OneDrive Risk:** The active repository path contains `OneDrive`. SQLite write-ahead logging (WAL) within OneDrive can experience file locking and synchronization race conditions. In production or local execution, database files must reside in local AppData or temp storage outside OneDrive when `DB_PROVIDER=sqlite`.

---

## 2. Frontend Architecture

- **Technology Stack:** Pure vanilla JavaScript with ECMAScript Modules (`import`/`export`), HTML5, and CSS3. Zero external runtime CDNs, zero third-party font/icon libraries, and no client-side bundling/build step.
- **Entry Point:** [public/index.html](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/index.html) hosts the single-page application shell:
  - Header: `#app-header`, `#sticky-status-bar` (Team name, stage count, timer, penalty counter, dossier button).
  - Rail: `#master-stage-rail` with step indicators.
  - Dossier: `#dossier-compact-strip` (compact 5-slot strip, needs expansion to 6 slots) and `#dossier-expanded-panel` collapsible drawer.
  - Main: `<main id="app-main">` dynamically populated by route views.
  - Modals: `#coordinator-help-modal`.
- **Client Module Layout:**
  - [public/js/app.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/app.js) (`23,639 bytes`): Router, state polling (5s interval, pauses when `document.hidden`), anti-tamper tab penalty listener (`visibilitychange` only, 5s debounce, 3s grace), dossier sync, local second-ticker timer.
  - [public/js/views/lobby.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/views/lobby.js) (`14,507 bytes`): Team creation form, member join form, and waiting lobby.
  - [public/js/views/stages.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/views/stages.js) (`45,658 bytes`): Tactical console renders for stages, in-place patching, optical beacon animation, and 4-slot key preview.
  - [public/js/views/admin.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/views/admin.js) (`21,675 bytes`): Admin control panel, team table, penalty adjustments, hint manager, export controls.
  - [public/js/views/coordinator.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/views/coordinator.js) (`9,963 bytes`): Assigned team monitor, PIN authentication.
  - [public/js/decoder.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/decoder.js) (`2,112 bytes`): Stage 2 client cryptanalysis workbench helper (Base64, Hex, ROT13, Caesar).
  - [public/js/audio.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/audio.js) (`6,161 bytes`): Web Audio API synthesizer for Morse tones (retained offline).
- **Styling & Assets:**
  - [public/css/tokens.css](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/css/tokens.css) (`2,218 bytes`): Design tokens (colors, radii, spacing, HUD offset token).
  - [public/css/styles.css](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/css/styles.css) (`62,503 bytes`): Full visual styles.
  - Icons: Inlined self-hosted SVG sprite defs in `index.html` (`#icon-signal`, `#icon-lock`, `#icon-terminal`, `#icon-flag`, `#icon-users`, `#icon-check`, `#icon-alert`, `#icon-clock`, `#icon-copy`).

---

## 3. Backend Architecture & Route Inventory

- **Server Entry:** [server/index.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/index.js) initializes the HTTP listener on `PORT` (default 3000), while [server/app.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/app.js) defines middleware, security headers, rate limiting, and route mounts.
- **Data Access Layer:**
  - Facade: [server/dataService.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/dataService.js) exposes unified async methods.
  - Dispatcher: [server/repositories/index.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/repositories/index.js) selects implementation by `DB_PROVIDER` (`sqlite` or `supabase`).
  - Active Adapter: [server/repositories/sqliteRepository.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/repositories/sqliteRepository.js) provides zero-latency SQLite access via prepared statements and WAL mode.
- **API Routes:**
  | Route | Method | Handler File & Line | Purpose | Auth Mechanism |
  | :--- | :--- | :--- | :--- | :--- |
  | `/api/teams` | POST | [registration.js:12](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/registration.js#L12) | Team registration (3 or 4 members) | Public (Rate limited) |
  | `/api/recover-leader` | POST | [registration.js:163](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/registration.js#L163) | Single-use 6-digit leader session recovery | Public (Rate limited) |
  | `/api/state` | GET | [state.js:18](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/state.js#L18) | Polled game state & stage payload | Cookie (`fo_leader_token` or `fo_member_token`) |
  | `/api/health` | GET | [state.js:13](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/state.js#L13) | System health & timestamp | Public |
  | `/api/submit` | POST | [submissions.js:19](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/submissions.js#L19) | Stage fragment/answer submission | Cookie (`fo_leader_token` strictly required) |
  | `/api/tab-penalty` | POST | [submissions.js:235](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/submissions.js#L235) | Record client tab switch violation | Cookie (`requireTeam`) |
  | `/api/hint` | POST | [hints.js:11](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/hints.js#L11) | Unlock stage hint & charge penalty | Cookie (`requireTeam`) |
  | `/api/join` | POST | [join.js:9](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/join.js#L9) | Stage 5 multi-device member join | Cookie / Body device binding |
  | `/api/terminal` | POST | [terminal.js:15](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/terminal.js#L15) | Stage 4 simulated terminal console | Cookie (`requireTeam`) |
  | `/api/warden` | POST | [wardenRoutes.js:12](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/wardenRoutes.js#L12) | Stage 3 AI conversation engine | Cookie (`requireTeam`, rate capped) |
  | `/api/coordinator` | GET | [coordinator.js:12](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/coordinator.js#L12) | Assigned team monitoring | Query `name` + `pin` verified |
  | `/api/leaderboard` | GET | [leaderboard.js:10](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/leaderboard.js#L10) | Public score & ranking list | Public (Cached 2s) |
  | `/api/admin/*` | ALL | [admin.js:15-570](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/admin.js#L15-L570) | Comprehensive admin oversight | Header `x-admin-pin` or session cookie |
  | `/api/admin/hints` | GET/PUT | [admin.js:340](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/admin.js#L340) | Centralized hint management | Admin authentication |

---

## 4. Database Schema Reference

The tables and entities utilized across the application codebase:

1. **`teams`**:
   - `id` (TEXT, PK): UUID.
   - `name` (TEXT, UNIQUE): Normalised team name.
   - `coordinator` (TEXT): Assigned lab coordinator.
   - `startedAt` (INTEGER/BIGINT): Mission start timestamp.
   - `finishedAt` (INTEGER/BIGINT): Completion timestamp.
   - `stage` (INTEGER): Active stage number (1 to 6).
   - `penaltyMin` (INTEGER): Cumulative penalty minutes.
   - `pausedMs` (INTEGER): Cumulative paused time in milliseconds.
   - `sessionToken` (TEXT, UNIQUE): Leader device session token.
   - `status` (TEXT): `'active'`, `'waiting'`, `'finished'`.
   - `isPaused` (INTEGER): 1 if team is currently paused, 0 otherwise.
   - `teamPauseStartedAt` (INTEGER): Timestamp when current pause started.
   - `tabSwitches` (INTEGER): Number of detected tab switch violations.
   - `seed` (TEXT): Cryptographic seed for team-specific stage variations.
   - `version` (INTEGER): Monotonically increasing state version for ETag polling.
   - `stage1EnteredAt` (INTEGER): Timestamp when Stage 1 was opened.
   - `stage1OpensAt` (INTEGER): Timestamp when Stage 1 solve phase opens ($t_0 + 60\text{s}$).
   - `memberCount` (INTEGER): 3 or 4 registered members.
2. **`members`**:
   - `id` (TEXT, PK): UUID.
   - `teamId` (TEXT, FK -> `teams.id`): Parent team.
   - `fullName` (TEXT): Member name.
   - `isLeader` (INTEGER): 1 for squad leader (Member 1), 0 for operatives.
   - `deviceToken` (TEXT): Unique device fingerprint token bound upon join.
   - `codeType` (TEXT): `'mixed'` or `'alpha'`.
   - `assignedCode` (TEXT): Deterministic HMAC shard generated from team & member name.
3. **`progress`**:
   - Composite PK: `(teamId, stage)`.
   - `fragment` (TEXT): Solved key fragment secured for this stage.
   - `wrongAttempts` (INTEGER): Count of incorrect submissions for this stage.
   - `hintsUsed` (INTEGER): Number of hints unlocked (0, 1, or 2).
   - `solvedAt` (INTEGER): Timestamp when stage was completed.
4. **`submissions`**:
   - `id` (INTEGER/BIGSERIAL, PK).
   - `teamId` (TEXT, FK).
   - `stage` (INTEGER).
   - `valueHash` (TEXT): SHA-256 hash of submitted answer.
   - `rawValue` (TEXT): Kept for admin audit / dispute resolution.
   - `ok` (INTEGER): 1 if correct, 0 if incorrect.
   - `at` (INTEGER): Submission timestamp.
   - `idempotencyKey` (TEXT): Client UUID to prevent double billing / duplicate advances.
5. **`hint_config`**:
   - `id` (TEXT, PK): E.g. `h1_1`, `h1_2`, `h2_1`, etc.
   - `stage` (INTEGER): 1 to 6.
   - `hintNumber` (INTEGER): 1 or 2.
   - `moduleName` (TEXT): Stage title.
   - `enabled` (INTEGER): 1 if available to teams.
   - `category` (TEXT): Category tag.
   - `text` (TEXT): Hint content guidance.
   - `displayDurationSeconds` (INTEGER): Temporary display duration (30 for Stage 1 Morse).
   - `penaltyMinutes` (INTEGER): Penalty cost (3 for hint 1, 5 for hint 2).
   - `displayOrder` (INTEGER).
6. **`hint_usage`**:
   - Composite tracking: `teamId`, `stage`, `hintId`, `hintNumber`, `penaltyCharged`, `shownAt`, `visibleUntil`, `idempotencyKey`.
7. **`violations`**: Anti-tamper violation logs (`tab_switch`, penalty added, timestamp).
8. **`chat`**: WARDEN conversation history logs (`teamId`, `role`, `text`, `at`).
9. **`leader_recovery`**: Single-use 6-digit recovery codes (`teamId`, `code`, `expiresAt`, `used`).
10. **`audit_log`**: Administrative modifications log (`actor`, `action`, `details`, `at`).
11. **`settings`**: Key-value operational configurations (`clockPaused`, `gameStarted`, `startTogetherMode`, `winnersNotepad`, `allowNewTeams`).
12. **`team_sequences`**: Seeded Stage 2 fragment orders.
13. **`schema_version`**: Migration tracking table.

---

## 5. Security & Credential Audit

- **Git Tracking of Secrets:**
  - Running `git check-ignore -v .env` confirmed that `.env` is properly ignored (`.gitignore:2:.env`).
  - Working tree search identified legacy default strings in fallback clauses (`server/config.js` had `INVICTORS@23` fallback).
  - Git history commit `e73ef84` contains historical references to `INVICTORS@23`.
- **Server-Side Isolation:**
  - Supabase secret key (`sb_secret_*`) is restricted strictly to backend processes. No frontend bundle or API payload exposes `sb_secret_*`, `DATABASE_URL`, or `ADMIN_PIN`.
  - Browser communicates exclusively with Express endpoints; the frontend never connects to `supabase.co` directly.
- **Admin Authentication:**
  - Server endpoints verify `ADMIN_PIN` using timing-safe comparisons (`crypto.timingSafeEqual`).
  - Rate limiting enforces 5 failures per 10 minutes per IP before issuing HTTP 429 (`Retry-After`).
- **XSS & Injection Protection:**
  - `containsInvalidChars` rejects `<, >, \0` and control characters on team registration, member names, and coordinator inputs.
  - Client utility `esc()` escapes HTML entities (`&, <, >, ", '`).
