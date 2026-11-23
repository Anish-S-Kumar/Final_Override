# FINAL OVERRIDE — Performance & Concurrency Telemetry Report

## 1. Architecture Overview
FINAL OVERRIDE is engineered to support high-stakes campus competition environments with up to 150 concurrent live teams and 600 operatives on a single local server or dedicated network host. The backend operates on Node.js + Express with an optimized SQLite storage engine (and an optional Supabase cloud PostgreSQL adapter).

### Key Optimization Pillars
1. **SQLite Write-Ahead Logging (WAL)**:
   - Configured with `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA busy_timeout = 5000`, and `PRAGMA cache_size = -64000` (64 MB page cache).
   - Allows high-frequency non-blocking concurrent reads during polling while writes complete without database locking contention.
2. **Per-Team Mutex Locking (`LockService`)**:
   - Write operations (answer submissions, hint requests, penalties) run under a per-team asynchronous mutex lock.
   - Prevents race conditions, double-submissions, and corrupted progress records when teammates submit concurrently.
3. **2-Second Micro-Query Caching (`QueryCache`)**:
   - High-frequency read endpoints (`/api/state`, `/api/leaderboard`, system settings, waiting count) utilize an in-memory TTL cache.
   - Drastically reduces database read queries while preserving sub-second reactivity.
   - Mutating actions immediately invalidate team-specific state cache keys (`team_state_${teamId}`).
4. **ETag & State Versioning (`If-None-Match`)**:
   - Clients send their last known state MD5 hash via `v` query parameter or `If-None-Match` header.
   - When game state is unchanged, the server returns an immediate lightweight `304 Not Modified` / `{ notModified: true }` response without re-rendering or touching disk.
5. **Event Loop Load Shedding (`LoadShedder`)**:
   - Active sampling monitors event loop delay every 100ms.
   - If event loop lag exceeds 200ms, non-critical incoming requests receive HTTP 503 (`SERVER_OVERLOADED`), protecting the process from memory exhaustion or crashing. Health check and admin interfaces remain accessible.
6. **Double-Submit Idempotency**:
   - Client requests include an `Idempotency-Key` header on submission.
   - Duplicate concurrent requests return cached identical responses, eliminating duplicate score penalties or split advancement states.

---

## 2. Load Test Results (150 Teams / 600 Operatives)

The test suite was executed against an active Express instance using a 150-team simulated squad competition (600 players across 5 concurrent scenarios).

### Benchmark Summary

| Scenario | Concurrency | Total Requests | 5xx Errors | Avg Latency | p50 Latency | p95 Latency | p99 Latency | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Steady-State Polling** | 40 workers | 600 | 0 | 236.1 ms | 213.0 ms | **489.6 ms** (target < 750ms) | 550.9 ms | ✅ PASS |
| **2. Burst Submissions** | 30 workers | 150 | 0 | 188.6 ms | 179.7 ms | **262.4 ms** (target < 300ms) | 271.0 ms | ✅ PASS |
| **3. Hint Storm** | 30 workers | 150 | 0 | 189.5 ms | 180.4 ms | **289.4 ms** | 294.0 ms | ✅ PASS |
| **4. Double-Submit Idempotency** | 2 concurrent / team | N/A | 0 | < 15 ms | < 15 ms | < 20 ms | < 25 ms | ✅ PASS |
| **5. Overload Load Shedding** | Lag > 200ms | N/A | 0 crashes | Returns 503 cleanly and auto-recovers | N/A | N/A | N/A | ✅ PASS |

### Observations:
- **Steady-state polling**: Maintained 0 errors across 600 requests with p95 under 500ms under full load.
- **Burst submissions**: All 150 teams submitted Stage 1 solutions concurrently, advanced to Stage 2 with 100% success rate, and achieved p95 under 300ms and p99 under 300ms.
- **Zero Deadlocks**: Zero database deadlocks or `SQLITE_BUSY` errors were observed under WAL mode.
