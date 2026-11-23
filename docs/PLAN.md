# FINAL OVERRIDE — Master Implementation Plan & Traceability Matrix

## 1. Traceability Table

| Req # | Description | Target Files | Proving Test / Verification |
| :--- | :--- | :--- | :--- |
| **SEC-1.1** | Tactical Game HUD Redesign (Dark, flat, tokens, no emoji/glow/gradient text) | `public/css/tokens.css`, `public/css/styles.css` | UI visual inspection, DOM snapshot test |
| **SEC-1.2** | Self-hosted SVG icon set, no external CDNs / Google Fonts | `public/index.html`, `public/css/tokens.css`, `public/assets/icons.svg` | Zero external network requests audit |
| **SEC-1.3** | Stage Rail, Top HUD bar with tabular numerals, collapsible notebook | `public/index.html`, `public/js/views/stages.js`, `public/css/styles.css` | Tabular numeral verification, HUD test |
| **SEC-1.4** | No-flicker live refresh, local 1s timer, keyed row updates | `public/js/app.js`, `public/js/views/*.js` | Headless DOM patch assertion, zero container replacement |
| **SEC-1.5** | Responsive layout 360px–1920px, scroll-margin, remove personal numbers | `public/css/styles.css`, `public/index.html`, `public/js/app.js` | Multi-resolution layout overflow test |
| **SEC-2.1** | Stage 1 60-second server-authoritative countdown on first entry | `server/routes/api/state.js`, `server/routes/api/submissions.js`, `server/content/mission.json` | Test: rejects submission before open, countdown in API |
| **SEC-2.2** | Stage 1 Morse Reference Chart: visible during 60s, then hidden | `server/routes/api/state.js`, `public/js/views/stages.js` | Test: chart present before 60s, absent after 60s |
| **SEC-2.3** | Stage 1 Hint: re-shows chart for 30s with `chartVisibleUntil` | `server/routes/api/hints.js`, `server/routes/api/state.js`, `public/js/views/stages.js` | Test: hint unlocks chart, API hides content after 30s |
| **SEC-2.4** | Stage 1 Sector cards: clean visuals, remove duplicate Morse text, keep strobe decoy | `server/content/mission.json`, `public/js/views/stages.js` | Test: no repeated Morse strings in DOM, ZETA9 trapped |
| **SEC-3.1** | Stage 2 Randomization: deterministic seeded PRNG order per team | `server/logic/stage2Randomizer.js`, `server/routes/api/registration.js` | Test: 200 teams solvable, >=20 distinct orders, reload consistency |
| **SEC-3.2** | Stage 2 Validation: lowercase strictly required, uppercase gives reminder without penalty | `server/routes/api/submissions.js` | Test: uppercase returns 400 lowercase reminder without penalty |
| **SEC-3.3** | Cryptanalyst Workbench: output area with copy, step history/undo, Caesar shift, Vigenere key | `public/js/decoder.js`, `public/js/views/stages.js` | Client decoder functional test |
| **SEC-4.1** | Stage 4 Briefing: detailed background, concepts, terms box, objective | `server/content/mission.json`, `public/js/views/stages.js` | Briefing presence test in Stage 4 payload |
| **SEC-4.2** | Stage 4 Token 1 Injection & Terminal: traversal blocked, history, clear, help | `server/routes/terminal.js`, `server/routes/api/state.js` | Test: traversal attacks blocked, history up-arrow supported |
| **SEC-5.1** | 5 Stages Consolidation: merge old Stages 5 & 6 into unified Stage 5 | `server/logic/stages.js`, `server/content/mission.json`, `server/routes/api/state.js` | Test: 5 stages across DB, registration, UI rail, completion |
| **SEC-5.2** | Stage 5 Team Code Distribution: 4 players (2 mixed, 2 alpha), device isolation | `server/logic/shard.js`, `server/routes/api/join.js` | Test: member gets only their own code, leader cannot read members' |
| **SEC-5.3** | Removal of `FO{...}`, digit sum `#`, reverse Stage 3 piece, alphabetical rule | `server/logic/finalKey.js` (deleted), codebase grep | Grep test: zero matches for FO{ or digit-sum checksum |
| **SEC-5.4** | Stage 5 Final Answer derivation and configurable machine names in hint | `server/logic/stage5Override.js`, `server/content/mission.json` | Test: machine names match config, answer derivation test |
| **SEC-6.1** | Central Hint Configuration: stage, module, duration, penalty, category | `server/repositories/hintRepository.js`, `server/routes/api/hints.js` | Test: per-module durations, server-enforced visibility window |
| **SEC-7.1** | Admin Portal Hint Management: editable table, audit logging, role auth | `server/routes/admin.js`, `public/js/views/admin.js` | Test: admin can update hints, players receive 403, audit logged |
| **SEC-8.1** | Repository Layer: SQLite adapter + Supabase/Firebase inactive stubs | `server/repositories/index.js`, `server/repositories/sqliteRepository.js` | Repository unit test, adapter selection test |
| **SEC-8.2** | Schema Migrations: `server/migrations/` and `npm run migrate` | `server/migrations/001_initial_schema.sql`, `scripts/migrate.js` | Test: migration runs cleanly on fresh DB |
| **SEC-9.1** | Vercel & Stateless Readiness: `server/app.js`, `api/index.js`, `docs/DEPLOYMENT.md` | `server/app.js`, `docs/DEPLOYMENT.md` | Production mode test, build script verification |
| **SEC-10.1** | Quality: code cleanup, ESLint, GitHub Actions CI workflow | `.github/workflows/ci.yml`, `scripts/lint.js` | `npm run lint` with 0 errors |
| **SEC-11.1** | Hardening: startup security checks, XSS helpers, rate limiters, temporary test DB | `server/config.js`, `server/logic/rateLimiter.js` | Acceptance test suite passes on `:memory:` DB |
| **SEC-12.1** | Backend Concurrency: per-team async mutex lock, `BEGIN IMMEDIATE` transactions | `server/services/lockService.js`, `server/repositories/sqliteRepository.js` | Test: concurrent submissions serialised, no duplicate advances |
| **SEC-12.2** | High Performance: WAL mode, prepared statements, 2s query caching, ETag versioning | `server/services/cacheService.js`, `server/routes/api/state.js` | Test: 304/notModified on unchanged poll, cache invalidation |
| **SEC-12.3** | Reliability: Idempotency-Key support, load shedding, central error handling | `server/middleware/idempotency.js`, `server/middleware/errorHandler.js` | Test: duplicate idempotency keys return identical response |
| **SEC-12.4** | Load Testing: `npm run loadtest` (150 teams, 600 players, burst, double-submit) | `tests/load/loadtest.js`, `docs/PERFORMANCE.md` | Load test passes targets (p95 < 150ms poll, p95 < 300ms write) |

---

## 2. Phase-by-Phase Implementation Roadmap

1. **Phase 1: Database Migrations, Repository Layer & Stateless Services**
   - Create `server/migrations/` with full SQL schema.
   - Implement `server/repositories/` (SQLite fully implemented, Supabase & Firebase inactive stubs).
   - Implement in-memory service interfaces: async lock, cache, rate limiter, event bus.
   - Implement Idempotency-Key middleware and request validation schemas.
2. **Phase 2: 5-Stage Core Engine & Game Logic**
   - Update `server/content/mission.json` and `mission.example.json` for exactly 5 stages.
   - Stage 1: 60s server countdown on first entry, sector cards read-only, Morse chart hidden after open, hint 30s unlock.
   - Stage 2: seeded PRNG per-team randomizer, expected answer derivation, lowercase-only validation.
   - Stage 3: WARDEN comms channel.
   - Stage 4: detailed briefing in config, path-traversal blocked terminal, dynamic token 1 injection.
   - Stage 5: merged Team Sync & Final Override, 4 player codes (2 mixed, 2 alpha), device isolation, machine names hint. Excised old `finalKey.js`.
   - Section 6 & 7: central hint configuration and Admin Hint Management endpoints.
3. **Phase 3: Tactical HUD UI/UX Redesign**
   - Create `public/css/tokens.css` with tactical design variables.
   - Replace emoji with self-hosted inline SVG icon set.
   - Remove Google Fonts CDN links; use clean self-contained technical font stacks.
   - Build Slim HUD bar, 5-stage rail, collapsible notebook, and responsive stage consoles.
   - Implement Cryptanalyst Workbench enhancements (output box, copy, undo history).
   - Update all views for 5 stages and 4 players.
4. **Phase 4: Concurrency Hardening, Load Testing & Documentation**
   - Write standalone high-concurrency load testing engine `tests/load/loadtest.js` (`npm run loadtest`).
   - Run 150-team steady-state, burst, hint storm, double-submit, and overload scenarios.
   - Author `docs/PERFORMANCE.md`, `docs/DEPLOYMENT.md`, `docs/SCALING.md`.
5. **Phase 5: Verification & Acceptance Tests**
   - Expand `server/tests/acceptance.test.js` covering all requirement points.
   - Run `npm test`, `npm run lint`, `npm run build`, and `npm run loadtest`.
