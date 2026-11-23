# TASK 0: SYSTEM DIAGNOSIS REPORT (STAGE 2 & ADMIN PORTAL)
**Date:** 2026-11-22  
**Repository:** Final_Override (`Invictors-main`)  
**Environment:** Windows (PowerShell), Node.js v26.3.0, Express, SQLite (local) + Supabase (`Final Overide`, ref `vdqmugtolspszcjtiloa`)

---

## 0.1 Baseline Test Suite Results
Before any code changes were introduced in this pass, the complete suite was run and verified:

| Test / Check | Command | Exit Code | Status | Notes |
|---|---|---|---|---|
| Linter & Syntax Check | `npm run lint` | 0 | PASSED | 76 JS files validated, zero syntax errors |
| Acceptance Tests | `npm test` | 0 | PASSED | 22/22 acceptance tests passed |
| Content Integrity | `npm run content:check` | 0 | PASSED | 6/6 stages verified |
| Browser Flow & DOM | `npm run test:browser` | 0 | PASSED | 8/8 end-to-end browser scenarios passed |
| Build & Asset Verification | `npm run build` | 0 | PASSED | All critical deployment assets validated |

---

## 0.2 Data Provider Truth
- **Active Environment Configuration:**
  - `DB_PROVIDER`: `supabase` in `.env` (canonical source: `server/config.js:15`).
  - Active Repository Adapter: `SupabaseRepository` (delegated via `server/dataService.js:7` and `server/repositories/index.js:18`).
- **Route Inspection:**
  - Every API route (`server/routes/api/*.js`, `server/routes/admin.js`, `server/routes/coordinator.js`, `server/routes/leaderboard.js`, `server/routes/wardenRoutes.js`) imports and accesses data strictly through `server/dataService.js`.
  - Grep audit confirmed zero direct imports of `better-sqlite3` or `@supabase/supabase-js` inside route controllers.

---

## 0.3 Admin Portal Root-Cause Diagnosis (Real Browser Audit)
Playwright Chromium headless was launched against `http://127.0.0.1:53377/admin`. Diagnostic traces and network logs were captured.

### Comprehensive Evaluation of Hypotheses (a) through (i):

| Hypothesis | Verdict | Evidence / File & Line |
|---|---|---|
| **a. Provider mismatch** | **FALSE** | `server/dataService.js:7` and `server/repositories/index.js:18` cleanly dispatch to `SupabaseRepository`. Both operator and server utilize the configured provider. |
| **b. Database function missing** | **TRUE** | Neither SQLite nor Supabase currently has stored procedures or tables for `stage2_workbench` or `admin_overview`. Furthermore, Express lacked the `/api/admin/overview` route in `server/routes/admin.js:85`. |
| **c. Endpoint error swallowed** | **TRUE** | `public/js/views/admin.js:60` initiates `fetch('/api/admin/overview')`. Because Express only defined `/api/admin/teams`, the SPA catchall in `server/app.js` returned `index.html` (HTTP 200 with text/html). At `admin.js:69`, `res.json()` threw `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. The error was logged to console and swallowed in `catch`, leaving the UI permanently on `-- Registered Teams` and "Loading teams...". |
| **d. Response shape differs** | **TRUE** | `public/js/views/admin.js:70` expects `updateDashboard(data)` to receive an object with `{ serverNow, provider, mode, event, counts, teams, version }`. The existing endpoint `/api/admin/teams` returned `{ teams, clock, settings, ... }`. |
| **e. CSP blocks** | **FALSE** | No CSP violations were triggered in the browser console during navigation. However, inline onclick handlers in `public/js/views/admin.js` require consolidation into external listener files to prevent strict CSP issues. |
| **f. Render exception** | **FALSE** | `updateDashboard()` never executed because parsing failed in `loadData()` before any DOM rendering logic could run. |
| **g. Load shedding / rate limiting** | **FALSE** | The initial request to `/verify` returned 200 OK without tripping rate limiters. |
| **h. Cache returning empty** | **FALSE** | `queryCache` was not queried because the endpoint did not exist. |
| **i. Self-paced mode confusion** | **FALSE** | The UI stalls purely on the unhandled route, independent of `eventStartedAt` values. |

---

## 0.4 Database Audit
- **SQLite Database:**
  - Tables Present: `audit_log`, `chat`, `game_stages`, `hint_config`, `hint_usage`, `leader_recovery`, `members`, `progress`, `schema_version`, `settings`, `submissions`, `team_sequences`, `teams`, `violations`.
  - Tables Missing: `stage2_workbench`, `stage2_workbench_log`, `event_state`.
  - Column Alterations Needed: `hint_config` lacks `edited_by_admin` and `updated_by`.
- **Supabase Database:**
  - Remote schema matches SQLite base schema (14 tables).
  - Schema version table exists.
  - Stored functions needed: `stage2_get_workbench`, `stage2_save_workbench`, `admin_overview`, `admin_set_clock`, `admin_launch`, `get_schema_version`.

---

## 0.5 Stage 2 Current State Audit
- **Cipher & Workbench Deficiencies:**
  1. `public/js/decoder.js:58`: `vigenereDecode` executes `key.toUpperCase().replace(/[^A-Z]/g, '')`, which strips all numeric digits. As a result, entering a numeric key (e.g., `"231"`) produces an empty key and leaves the ciphertext unchanged.
  2. UI controls in `public/js/views/stages.js:385-407` present transformation buttons in multiple unorganized rows. Buttons do not display numeric indices 1..6, do not lock once used, and do not track step sequences.
  3. No workbench state persistence exists (`stage2_workbench` table and `/api/stage2/workbench` endpoint are missing). If a player refreshes, all intermediate workbench progress is lost.
  4. `server/content/mission.json:231-263`: Stage 2 configuration lacks structured `modules`, explicit `layers`, and `vigenere: { mode: "module-index-sequence" }`.

---

## 0.6 HUD Clock & Time-Cap Audit
- **HUD Clock Format:**
  - File: `public/js/app.js:250-252`
  - Current implementation:
    ```javascript
    const totalSecs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    timeDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    ```
  - Defect: Displays `MM:SS` from the start (e.g. `00:00`, `65:12`) rather than standard `HH:MM:SS` (e.g. `00:00:00`, `01:05:12`).
- **Time-Cap Enforcement:**
  - File: `server/routes/api/submissions.js:61-71`
  - Current implementation checks `TIME_CAP_ENFORCED` and `team.startedAt` during answer submissions and transitions status to `timed_out`.
  - Defect: Polling `/api/state` does not surface time-cap expiration status if the team does not submit an answer after the cap expires. The HUD clock does not freeze on expiration.

---
**Status:** Task 0 diagnosis complete. Proceeding to Task 1 implementation.
