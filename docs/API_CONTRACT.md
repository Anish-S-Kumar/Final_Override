# FINAL OVERRIDE — Master API Contract & Specification

Comprehensive REST and WebSocket interface specification for **FINAL OVERRIDE** escape room tech challenge.

---

## 1. Authentication & Security Headers

All team player requests must authenticate via the bearer session token returned upon registration:
- **Header**: `Authorization: Bearer <sessionToken>` OR cookie `token=<sessionToken>`.
- **Idempotency**: All mutation endpoints (`/api/submit`, `/api/hint`) accept `Idempotency-Key: <UUID>` to prevent duplicate requests from network retries.
- **Clock Synchronization**: Testing and verification scripts may provide `x-mock-now: <epochMs>` to inject deterministic server clock offsets without modifying system clocks.
- **Cache Control**: `/api/state` supports `If-None-Match: <ETag>`. Returns HTTP 304 Not Modified when state version matches.

---

## 2. Public / Client API Endpoints

### 2.1 `POST /api/register`
Registers a new team of 3 or 4 players.
- **Request Body**:
  ```json
  {
    "teamName": "CyberKnights",
    "coordinator": "Arun",
    "members": ["Alice Smith", "Bob Jones", "Charlie Brown", "Diana Prince"]
  }
  ```
  *Note*: Member 4 is optional. 3 or 4 names allowed.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "teamId": "team_1700000000_1234",
    "sessionToken": "tok_abcdef0123456789",
    "memberCount": 4
  }
  ```
- **Error Codes**: `400 Bad Request` (duplicate name, XSS detected, invalid member count), `403 Forbidden` (registration closed).

---

### 2.2 `GET /api/state`
Returns the hydrated game state for the calling team.
- **Headers**: `Authorization: Bearer <sessionToken>`
- **Response `200 OK` (Stage 1 Phase 1 — Memorise)**:
  ```json
  {
    "team": {
      "id": "team_123",
      "name": "CyberKnights",
      "stage": 1,
      "status": "active",
      "penaltyMin": 0,
      "memberCount": 4
    },
    "stageContent": {
      "phase": "memorise",
      "title": "Stage 1: Signal Intercept & Morse Matrix",
      "opensAt": 1700000060000,
      "lockRemainingMs": 42000,
      "chart": [ { "letter": "A", "code": "• —" } ],
      "serverNow": 1700000018000
    },
    "notebook": {},
    "serverTime": 1700000018000,
    "version": "a1b2c3d4e5f6"
  }
  ```
  *Note*: During Phase 1, `sectors` are strictly omitted from `stageContent`.
- **Response `200 OK` (Stage 1 Phase 2 — Solve)**:
  ```json
  {
    "stageContent": {
      "phase": "solve",
      "title": "Stage 1: Signal Intercept & Morse Matrix",
      "intro": { "title": "...", "text": "..." },
      "sectors": [
        { "id": 1, "name": "SECTOR 1", "badge": "PULSE SIGNAL", "morse": "— •" },
        { "id": 2, "name": "SECTOR 2", "badge": "BINARY CODE", "stream": "111-0-111-0-111" },
        { "id": 3, "name": "SECTOR 3", "badge": "BLINKING LIGHT", "unitMs": 600 },
        { "id": 4, "name": "SECTOR 4", "badge": "SATELLITE SIGNAL", "morse": "• —" }
      ],
      "chart": null,
      "hintActive": false,
      "lockRemainingMs": 0
    }
  }
  ```

---

### 2.3 `POST /api/submit`
Submits solution fragment for active stage.
- **Headers**: `Authorization: Bearer <sessionToken>`, `Idempotency-Key: <UUID>`
- **Request Body**:
  ```json
  { "answer": "NOVA" }
  ```
- **Response `200 OK` (Correct Answer)**:
  ```json
  {
    "success": true,
    "correct": true,
    "stage": 1,
    "nextStage": 2,
    "fragment": "NOVA",
    "finished": false,
    "verificationCode": null
  }
  ```
- **Response `200 OK` (Incorrect Answer)**:
  ```json
  {
    "success": false,
    "correct": false,
    "wrongAttempts": 2,
    "penaltyApplied": false,
    "totalPenaltyMin": 0
  }
  ```
- **Response `400 Bad Request` (Phase 1 Locked)**:
  ```json
  {
    "error": "Phase 1 (Memorise) is active... Submissions unlock in 34 seconds.",
    "locked": true,
    "remainingSeconds": 34
  }
  ```
- **Response `400 Bad Request` (Stage 2 Lowercase Required)**:
  ```json
  {
    "error": "Enter your answer in lowercase",
    "message": "Enter your answer in lowercase",
    "lowercaseRequired": true,
    "penalty": 0
  }
  ```

---

### 2.4 `POST /api/hint`
Requests a hint for the active mission stage. Enforces rules HR1–HR9 with atomic penalty application, idempotency protection, and strict rate limiting.
- **Stage 1 (Repeatable Morse Chart Reveal)**:
  - Unlocks a 30-second docked overlay containing the team's complete 26-alphabet Morse code table (`displayDurationSeconds: 30`).
  - Unlimited repeatable usage governed by deterministic penalty schedule `[3, 5]` minutes (+3m on 1st use, +5m on all subsequent uses).
  - Mid-window requests while the 30-second countdown is active return HTTP 200 with `costMinutes: 0` and `alreadyActive: true` without charging any penalty.
  - Submissions and hint requests before `stage1OpensAt` (during the 300s Memorise phase) are rejected with HTTP 400.
  - Never serves or renders outdated plain-text hint boxes on Stage 1 (`hints: []`).
- **Stages 2–6 (Progressive Text Hints)**:
  - Max 2 hints per stage (+3m for Hint 1, +5m for Hint 2). Returns encrypted/plain text hint string.
- **Rate Limit**: 1 request per 2 seconds per team. Returns HTTP `429 Too Many Requests` with header `Retry-After: 2` upon violation.
- **Headers**: `Authorization: Bearer <sessionToken>`, `Idempotency-Key: <UUID>`
- **Response `200 OK` (Stage 1)**:
  ```json
  {
    "success": true,
    "ok": true,
    "kind": "chart_reveal",
    "visibleUntil": 1700000030000,
    "displayDurationSeconds": 30,
    "costMinutes": 3,
    "useNumber": 1,
    "usesTotal": 1,
    "nextCostMinutes": 5,
    "newPenaltyMinutes": 3,
    "alreadyActive": false,
    "idempotent": false,
    "morseChart": [
      { "letter": "A", "code": "• —" }
    ]
  }
  ```

---

### 2.5 `POST /api/join`
Stage 5 individual teammate laptop device link.
- **Request Body**:
  ```json
  {
    "teamName": "CyberKnights",
    "memberName": "Bob Jones",
    "deviceToken": "dev_987654321"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "teamId": "team_123",
    "memberId": "mem_2",
    "shard": "0B6",
    "codeType": "mixed",
    "joinedCount": 2,
    "totalRequired": 4
  }
  ```

---

### 2.6 `POST /api/tab-penalty`
Anti-cheat client window blur / visibility change reporter.
- **Headers**: `Authorization: Bearer <sessionToken>`
- **Request Body**:
  ```json
  { "stage": 1, "details": "window blur" }
  ```
- **Response `200 OK`**:
  ```json
  { "success": true, "tabSwitches": 1, "penaltyMin": 0 }
  ```

---

### 2.7 `POST /api/terminal/exec`
Stage 4 interactive virtual cyber terminal execution.
- **Request Body**:
  ```json
  { "command": "cat robots.txt" }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "output": "User-agent: *\nDisallow: /admin/vault-token2-7.txt"
  }
  ```

---

### 2.8 `POST /api/warden/chat`
Stage 3 neural WARDEN comms dialogue.
- **Request Body**:
  ```json
  { "message": "Operative Alpha requesting crypto clearance. Access phrase is CYGNUS." }
  ```
- **Response `200 OK`**:
  ```json
  {
    "reply": "IDENTITY VERIFIED. ACCESS AUTHORIZED. Clearance Fragment: ZENITH",
    "real": true
  }
  ```

---

### 2.9 `GET /api/stage2/workbench`
Fetches current cryptanalyst workbench state for the calling team.
- **Headers**: `Authorization: Bearer <sessionToken>`
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "state": {
      "payloadLoaded": true,
      "steps": [
        { "t": "m", "i": 2 },
        { "t": "m", "i": 3 },
        { "t": "m", "i": 1 },
        { "t": "v", "k": "231" }
      ],
      "version": 4,
      "updatedAt": 1700000050000
    }
  }
  ```

---

### 2.10 `PUT /api/stage2/workbench`
Optimistically updates cryptanalyst workbench state with optimistic concurrency protection.
- **Headers**: `Authorization: Bearer <sessionToken>`
- **Request Body**:
  ```json
  {
    "action": "apply",
    "moduleIndex": 2,
    "expectedVersion": 3
  }
  ```
  Supported actions:
  - `"load"`: loads payload into workbench (`payloadLoaded: true`).
  - `"apply"`: applies module `1..6` (`steps.push({ t: 'm', i: moduleIndex })`). Enforces single-use.
  - `"vigenere"`: applies numeric Vigenère key `[1-9]` max 12 digits (`steps.push({ t: 'v', k: key })`).
  - `"undo"`: pops last applied step.
  - `"reset"`: clears all steps (`steps: []`).
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "state": {
      "payloadLoaded": true,
      "steps": [{ "t": "m", "i": 2 }],
      "version": 4,
      "updatedAt": 1700000055000
    }
  }
  ```
- **Error `409 Conflict`**: Returned when `expectedVersion` does not match server version (another device updated workbench). Payload includes current server state:
  ```json
  {
    "error": "Version conflict: workbench was updated in another session",
    "currentVersion": 5,
    "state": { "payloadLoaded": true, "steps": [...], "version": 5 }
  }
  ```

---

## 3. Administrative & Coordinator API Endpoints

- `GET /api/leaderboard`: Public live scoreboard with dynamic ranking and penalty weighting.
- `POST /api/coordinator/login`: Coordinator login with Name + PIN.
- `POST /api/admin/login`: Admin login with `ADMIN_PIN`.
- `GET /api/admin/overview`: Single consolidated administrative overview. Returns all registered teams, stage distributions, live clock status, submission logs, and anti-cheat alerts. Cached <= 2s with ETag support.
- `POST /api/admin/clock`: Updates event clock state (mode: `self_paced` | `synchronized`, `offsetMs`, `capMinutes`, `isPaused`). Invalidates admin cache immediately.
- `POST /api/admin/launch`: Global launch of all waiting teams to Stage 1 active simultaneously.
- `POST /api/admin/global-pause`: Toggles global event pause.
- `POST /api/admin/reissue-token`: Generates emergency 6-digit recovery code for disconnected team leaders.
- `GET /api/admin/export`: Exports complete audit trail in JSON or CSV.
