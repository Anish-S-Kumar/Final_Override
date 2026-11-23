# Comprehensive Forensic Diagnosis: Stage 1 Morse Discrepancies, Sector 3 Leaks & Hint Subsystem

**Document**: `docs/DIAGNOSIS_STAGE1_MORSE_HINTS.md`  
**Date**: 2026-11-23  
**Status**: Completed (Task 0 Evidence Gate)  
**Backup Path**: `C:\Users\lenovo\final_override_backup_20261123_pass5`

---

## 1. Baseline Verification Suite (Task 0.1)

Before initiating code modifications, the entire regression and validation pipeline was executed to establish an authoritative baseline. All test suites passed with exit code 0.

| Test Command | Scope / Area | Exit Code | Real Result Summary |
| :--- | :--- | :---: | :--- |
| `npm run lint` | Project linter & syntax checks | **0** | All 79 JS files validated with zero syntax errors. |
| `npm test` | Core acceptance test suite (Tests 1–22) | **0** | All 22 acceptance tests passed cleanly. |
| `npm run content:check` | Mission content integrity verification | **0** | All 6 stages passed integrity verification. |
| `npm run test:browser` | Headless DOM & flow verification | **0** | All 6 browser flow & DOM tests passed. |
| `npm run build` | Asset compilation & architecture check | **0** | Express instance and critical assets confirmed. |

---

## 2. Diagnosis of R1: Morse Table and Sector Discrepancy (Task 0.2 & 0.3)

### 2.1 The Core Mechanism Failure
When inspecting the client and server code, the cause of the discrepancy between the Morse reference table and the sector clues is a **severe disconnect between the server-side dynamic randomizer and the client-side stage renderer**:

1. **Server Randomizer** (`server/logic/stage1Randomizer.js`):
   - Computes a deterministic per-team shuffle of 26 Morse patterns based on `team.seed`.
   - Generates dynamic sector payloads (`generateStage1Sectors(chart, 'NOVA')`):
     - Sector 1: intercepts pulses matching `chart[N]`.
     - Sector 2: formats binary stream `1` / `111` matching `chart[O]`.
     - Sector 3: generates optical pulse timeline `{on, off}` matching `chart[V]`.
     - Sector 4: intercepts satellite signal matching `chart[A]`.
2. **Client-Side Hardcoding** (`public/js/views/stages.js:192–270`):
   - **Crucial Flaw**: When rendering Stage 1 Phase 2 (Solve), `public/js/views/stages.js` **completely ignores `content.sectors` sent by the server**. Instead, it renders hardcoded HTML containing standard Morse strings for every single sector:
     - Sector 1 (`stages.js:200`): Hardcoded `Two pulses intercepted: a Long pulse (Dash —) followed by a Short pulse (Dot •)`. Chips: `[DASH (—), DOT (•)]` (Standard Morse for `N`).
     - Sector 2 (`stages.js:216`): Hardcoded `A binary stream was received: 111-0-111-0-111. Rule: 111 = Dash (—) and 0 = Space`. Chips: `[—, —, —]` (Standard Morse for `O`).
     - Sector 3 (`stages.js:233`): Hardcoded `An optical beacon flashes 3 short blinks and 1 long blink:` (Standard Morse for `V`: `• • • —`).
     - Sector 4 (`stages.js:262`): Hardcoded `The final pulse: a Short pulse (Dot •) followed by a Long pulse (Dash —)`. Chips: `[DOT (•), DASH (—)]` (Standard Morse for `A`).
3. **The Strobe Output Override** (`public/js/views/stages.js:1079`):
   - When the user presses "Watch Light Blink", the strobe actually plays the server's pulses (`s3.pulses` derived from the randomized `chart[V]`).
   - When finished, line 1079 injects:
     `lampEnded.textContent = 'Transmission ended. Pattern: ' + (s3?.morse || '• • • —');`
     which displays the *randomized* pattern (e.g. `— • — —`), directly conflicting with the hardcoded description ("3 short blinks and 1 long blink") right above it, and conflicting with the table if standard Morse was assumed!

### 2.2 Forensic Pattern Comparison (One Test Team on SQLite)
For test team `DiagSquad_Alpha` (`seed_1795373599979`), evaluating the target word **NOVA**:

| Answer Letter | (a) Memorise Chart Pattern | (b) Hint Chart Pattern | Match (a)/(b)? | (c) Sector Output Pattern | Match (a)/(c)? | (d) Sector Description Implied | DOM Rendered Text (Bug) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **N** (Sector 1) | `• • — •` | `• • — •` | **MATCH** | `• • — •` | **MATCH** | Short, Short, Long, Short | `Long, Short` (`— •`) **MISMATCH** |
| **O** (Sector 2) | `— • — —` | `— • — —` | **MATCH** | `— • — —` | **MATCH** | `111-0-1-0-111-0-111` | `111-0-111-0-111` (`———`) **MISMATCH** |
| **V** (Sector 3) | `• • —` | `• • —` | **MATCH** | `• • —` | **MATCH** | 2 quick, 1 long | `3 short, 1 long` (`•••—`) **MISMATCH** |
| **A** (Sector 4) | `— • • •` | `— • • •` | **MATCH** | `— • • •` | **MATCH** | Long, Short, Short, Short | `Short, Long` (`• —`) **MISMATCH** |

### 2.3 Code Paths Generating or Containing Letter-to-Pattern Data
1. `server/logic/stage1Randomizer.js:7–34`: `STANDARD_PATTERNS` array containing 26 Morse patterns.
2. `server/logic/stage1Randomizer.js:38–66`: `generateStage1Chart(seed)` shuffles `STANDARD_PATTERNS` using HMAC-SHA256.
3. `server/logic/stage1Randomizer.js:83–165`: `generateStage1Sectors(chart, answer)` builds dynamic descriptions and pulse sequences.
4. `server/routes/api/state.js:101–106`: Re-invokes `generateStage1Chart` and `generateStage1Sectors` on every `/api/state` request.
5. `server/routes/api/hints.js:76`: Invokes `generateStage1Chart(team.seed || team.id || team.name)` when re-opening the chart.
6. `server/content/mission.json:15–220`: Hardcoded static standard Morse table in `stage1.morseChart` (redundant source of truth).
7. `public/js/views/stages.js:192–270`: Hardcoded static HTML sector cards with standard Morse descriptions and chips.
8. `public/js/views/stages.js:1063–1067`: Hardcoded fallback pulses for the strobe lamp:
   `[{ on: unitMs, off: unitMs }, { on: unitMs, off: unitMs }, { on: unitMs, off: unitMs }, { on: unitMs * 3, off: unitMs }]`.

### 2.4 Chart Stability & Table Uniqueness
- **Regeneration vs Stability**: The chart is recomputed dynamically on each request in `state.js` and `hints.js`. Because it uses deterministic HMAC-SHA256, it returns identical patterns *provided* the seed is identical. However, `hints.js` falls back to `team.seed || team.id || team.name`, which can cause divergence if `seed` is null in one context.
- **Domain Separation**: `stage1Randomizer.js` uses `':stage1-chart'` and `':stage1-chart:ext'`.
- **Pattern Uniqueness**: Tested across 200 random seeds: all 26 letters receive 26 distinct patterns of length 1 to 4. Zero duplicate patterns are generated on the server.
- **Why I and L Looked Identical & Visual Formatting Flaws**:
  - In `public/css/styles.css:2222–2250`, `.morse-tile` uses `display: flex; justify-content: space-between; align-items: center;`.
  - The letters are left-aligned while the pattern codes are **right-aligned** (`justify-content: space-between`), creating an uneven, ragged appearance across columns.
  - The pattern uses raw Unicode characters `•` (U+2022) and `—` (U+2014) with `letter-spacing: 1px;`. Depending on system font rendering (especially in monospace fonts where em-dash width varies), dots and dashes appear jagged and uneven.
  - The capital letter `I` and capital letter `L` in certain monospace/system fonts have similar vertical strokes, and when right-aligned patterns vary in length, visual scanning across adjacent tiles creates confusion.

---

## 3. Diagnosis of R2: Sector 3 Leaks and Trap Text (Task 0.3)

### 3.1 Line-by-Line Evidence of Leakage
1. **Explicit Pattern Display on Playback Completion** (`public/js/views/stages.js:1079`):
   ```javascript
   lampEnded.textContent = 'Transmission ended. Pattern: ' + (s3?.morse || '• • • —');
   ```
   This explicitly writes the exact Morse code pattern into the DOM after playback ends, defeating the puzzle objective.
2. **Duplicate Transmission Ended Labels**:
   - Element 1: `<span id="optical-beacon-status" class="beacon-status-label">READY</span>` which changes to `'TRANSMISSION ENDED'` (`stages.js:1075`).
   - Element 2: `<span id="optical-beacon-ended" class="transmission-ended-badge">Transmission ended. Pattern: ...</span>` (`stages.js:1079`).
3. **Decoy Trap Alert Leaking Decoy Word**:
   - `public/js/views/stages.js:251`:
     `<span>Trap Alert: Optical interference may flash decoy word <code>ZETA9</code>. Ignore it!</span>`
   - `server/logic/stage1Randomizer.js:146`:
     `trapAlert: '⚠️ Trap Alert: Screen may flash decoy word ZETA9. Ignore it!'`
   - `server/content/mission.json:95`:
     `"trapAlert": "⚠️ Trap Alert: Screen may flash decoy word ZETA9. Ignore it!"`
   - This explicitly gives away the decoy word in plain text, undermining the anti-tamper trap mechanic.

---

## 4. Diagnosis of R3: Stage 1 Hints System & Answer Leak (Task 0.4)

### 4.1 Provenance of Hint Texts and the Answer Leak
- **The NOVA Leak**:
  - `server/services/referenceData.js:26`:
    `text: 'The 4 sectors spell out the vault password NOVA.',`
  - `server/content/mission.json:223`:
    `"The 4 sectors spell out the vault password NOVA."`
  - `supabase/migrations/001_initial_schema.sql:204`:
    `('h1_2', 1, 2, 'Signal Intercept', 1, 'solution', 'The 4 sectors spell out the vault password NOVA.', 0, 5, 2)`
  - Hint 2 directly reveals the solution word `NOVA`, completely neutralizing the escape-room challenge.

### 4.2 Why Both Hints Render Together and Buttons Say "No hints left"
1. **Server Route** (`server/routes/api/state.js:73–78`):
   ```javascript
   const revealedHints = [];
   if (stageConfig && stageConfig.hints) {
     for (let i = 0; i < currentProg.hintsUsed; i++) {
       revealedHints.push(stageConfig.hints[i]);
     }
   }
   ```
   When `hintsUsed` is 2, `revealedHints` contains both Hint 1 and Hint 2.
2. **Client Render** (`public/js/views/stages.js:698–712`):
   ```html
   <div id="stage-active-hint-container" class="stage-hint-container">
     ${(content.hints || []).map((h, i) => `
       <div class="stage-hint-box" data-hint-index="${i + 1}">
         <span class="hint-badge-label">Hint ${i + 1} used (+${costMin} min)</span>
         <p class="hint-text">${esc(hintText)}</p>
       </div>
     `).join('')}
   </div>
   ```
   All unlocked hints are rendered simultaneously as stacked boxes that stay in the DOM indefinitely.
3. **Button Disabling & Labeling** (`public/js/views/stages.js:689–692` & `stages.js:759–765`):
   ```javascript
   <button id="btn-request-hint" class="btn btn-sm btn-outline btn-warning" ${prog.hintsUsed >= 2 ? 'disabled' : ''}>
     <span>${prog.hintsUsed === 0 ? 'Hint 1 of 2 (+3 min)' : (prog.hintsUsed === 1 ? 'Hint 2 of 2 (+5 min)' : 'No hints left')}</span>
   </button>
   ```
   The client hardcodes a ceiling of 2 hints. Once `hintsUsed >= 2`, it changes the label to "No hints left" and permanently disables the button.

### 4.3 Database and Constraint Limitations Blocking a 3rd Hint
1. **Supabase Check Constraints**:
   - `supabase/migrations/001_initial_schema.sql:94`:
     `"hintNumber" INTEGER NOT NULL CHECK ("hintNumber" IN (1, 2))` on table `public.hint_config`.
   - `supabase/migrations/001_initial_schema.sql:110`:
     `"hintNumber" INTEGER NOT NULL CHECK ("hintNumber" IN (1, 2))` on table `public.hint_usage`.
   - Inserting any hint request where `hintNumber > 2` throws a Postgres check constraint violation (`23514`).
2. **Supabase Stored Procedure** (`supabase/migrations/002_game_functions.sql:200–240`):
   - `public.request_hint` queries `hint_config` by `p_hint_number` and verifies `hint_usage`. It has no support for repeatable, unlimited hint kinds or cost schedules.
3. **Server Route Hard-Cap** (`server/routes/api/hints.js:99`):
   ```javascript
   if (currentHintsUsed >= 2) {
     return res.status(400).json({ error: 'Maximum hints (2) already unlocked for this mission.' });
   }
   ```
   Rejects any hint request past use #2.

---

## 5. Architectural Corrective Strategy

Based on the forensic findings, the implementation will strictly adhere to Decisions D1, D2, and D3:

1. **Task 1: Single Source of Truth for Morse Reference Table**:
   - Implement `server/services/stage1/chart.js` with `chartForTeam(team)`.
   - Seeded via `HMAC(team.seed, "stage1-chart")`.
   - Validate 26 unique patterns of length 1 to 4.
   - Dynamically generate sector descriptions with `describePattern(pattern)` in `server/services/stage1/describePattern.js`.
   - Client renders both memorise and hint charts using a unified, clean SVG/glyph component with fixed-width glyphs (dots: 6px circles, dashes: 16x6px rounded rects, 4px gap, left-aligned in monospace cells).
2. **Task 2: Sector 3 & Trap Cleansing**:
   - Purge `Pattern: ...` and duplicate ended labels from `public/js/views/stages.js`.
   - Retain a single status label: `READY`, `FLASHING...`, `DONE`.
   - Strip all plain-text trap alerts naming `ZETA9` from HTML, payload, and mission files.
3. **Task 3: Repeatable Stage 1 Hint Subsystem**:
   - Create `hint_policy` table in both SQLite and Supabase:
     - Stage 1: `kind = 'chart'`, `max_uses = NULL` (unlimited), `cost_schedule_minutes = [3, 5]`, `display_seconds = 30`.
     - Stages 2–6: `kind = 'text'`, `max_uses = 2`, `cost_schedule_minutes = [3, 5]`.
   - Lift `CHECK ("hintNumber" IN (1, 2))` on `hint_usage`.
   - Implement atomic, idempotent `request_hint` supporting repeatable chart windows.
   - Purge leaking `h1_2` row and text from `hint_config` and `mission.json`.
   - Update client to render docked non-shifting drawer with draining countdown bar for Stage 1.
