# FINAL OVERRIDE — Pass 2 Root Cause Diagnosis (Task 0)

Date: 2026-11-22  
Environment: Windows (PowerShell), Node.js, SQLite / Supabase Cloud  
Diagnostic Engine: Playwright + Chromium (Headless, real browser DOM & network intercept)  
Pre-Flight Working Tree Backup: `C:\Users\lenovo\final_override_backup_20261122_pass2` (152 files copied, outside repository and OneDrive)

---

## 0.1 Baseline Verification (Pre-Fix State)

All repository sanity checks were executed against the working tree prior to modification:

| Command | Exit Code | Output Summary |
| :--- | :---: | :--- |
| `npm run lint` | 0 | 72 JS files clean. No ESLint errors or warnings. |
| `npm test` | 0 | 22 test suites passed: Registration, Staging, DB Adapters, Security, Shards. |
| `npm run content:check` | 0 | Content verified across all 6 stages; mission payload intact. |
| `npm run test:browser` | 0 | JSDOM browser simulation test suite passed. |
| `npm run build` | 0 | Static build and deployment checks passed. |

---

## 0.2 R3 Lamp Blink Diagnosis (`#optical-beacon-lamp`)

### Observed Symptoms
Pressing "▶ Watch Light Blink" in Stage 1 fails to produce any visible light flashing on the lamp element.

### Diagnostic Evidence (Playwright Real-Browser Execution)
- **Initial Computed Style (`#optical-beacon-lamp`)**:
  - `classes`: `beacon-lamp`
  - `backgroundColor`: `rgb(26, 34, 48)` (dark surface tone)
  - `border`: `2px solid rgb(48, 54, 61)`
  - `boxShadow`: `none`
  - `width`: `20px`, `height`: `20px`
- **Button State**: `#btn-trigger-strobe` exists, is enabled, text: `▶ Watch Light Blink`.
- **Playback Sampling (every 50ms over 3500ms)**:
  - Distinct CSS classes applied during playback: `['beacon-lamp', 'beacon-lamp lamp-on']`
  - Distinct computed `backgroundColor` values observed: `['rgb(26, 34, 48)']` (Unchanged throughout!)
  - Class changes detected: `true`
  - Computed color changes detected: `false`

### Root Cause Analysis (Suspects a–e)
1. **Suspect (a) & (b) — CSS Selector Mismatch (PRIMARY DEFECT)**:
   - In `public/js/views/stages.js:890`, the strobe animation loop sets:
     ```javascript
     lamp.className = 'beacon-lamp lamp-on';
     ```
   - In `public/css/styles.css:2228`, the active state rule is defined as:
     ```css
     .beacon-lamp.active {
       background-color: var(--accent-warning);
       box-shadow: 0 0 12px var(--accent-warning);
     }
     ```
   - No CSS rule exists anywhere for `.lamp-on` or `.beacon-lamp.lamp-on`. As a result, toggling `.lamp-on` causes zero visual rendering difference in the browser.
   - Furthermore, `.beacon-lamp.active` in `styles.css:2230` contains `box-shadow: 0 0 12px var(--accent-warning)`, which is a glow effect violating Ground Rule 7 ("no glow, no gradients").
2. **Suspect (c) — Reduced Motion Handling**:
   - `prefers-reduced-motion` was not handled. In `styles.css`, no `@media (prefers-reduced-motion: reduce)` block handles `.beacon-lamp`.
3. **Suspect (d) — Event Listener Binding**:
   - In `public/js/views/stages.js:864`, the click listener is bound directly to `#btn-trigger-strobe` after DOM insertion. If the stage re-renders, the event listener can become detached without event delegation.
4. **Suspect (e) — Server Timing Payload**:
   - Server payload correctly sends `unitMs: 600` and `leadInMs: 800`.

---

## 0.3 R4 Hint Button Diagnosis (Stage 1 & Stage 2)

### Stage 1: Morse Reference Chart Unlock Failure
- **Behavior**: Clicking "Hint (+3m)" prompts the player:
  `"Unlocking a hint adds official penalty minutes to your team score and reveals the Morse chart for 30 seconds. Proceed?"`
  Upon accepting, HTTP POST `/api/hint` succeeds (200 OK) with:
  ```json
  {
    "success": true,
    "hintsUsed": 1,
    "hint": "Reveal the 15-letter Morse Code Reference Chart for 30 seconds.",
    "penaltyMin": 3,
    "displayDurationSeconds": 30,
    "visibleUntil": 1795334380473,
    "morseChart": [...]
  }
  ```
- **DOM State After Click**:
  - `#stage1-morse-chart-panel` exists: `false`.
  - Chart display: `null`.
  - Timer element: `undefined`.
- **Root Cause**:
  In `public/js/views/stages.js:268`, the Morse chart container `#stage1-morse-chart-panel` is conditionally rendered **only when** `chartUnlocked === true` during initial HTML string generation. In Stage 1 Solve phase, `chartUnlocked` is false, so `#stage1-morse-chart-panel` is completely omitted from the DOM.
  When the user clicks `#btn-request-hint`, `triggerMorseChartUnlock()` in `stages.js:930` calls:
  ```javascript
  const chartPanel = document.getElementById('stage1-morse-chart-panel');
  if (!chartPanel) return; // Silent early-exit!
  ```
  The function returns immediately because the element does not exist. The application controller then calls `patchStageInPlace(state)`, which does not re-create the card, leaving the chart invisible.

### Stage 2: Missing Hint Container
- **Behavior**: Clicking "Hint (+3m)" in Stage 2 triggers HTTP POST `/api/hint` returning 200 OK:
  ```json
  {
    "success": true,
    "hintsUsed": 1,
    "hint": "Layer 1 is Base64, Layer 2 is Hexadecimal, Layer 3 is ROT13.",
    "penaltyMin": 6,
    "displayDurationSeconds": 0
  }
  ```
- **DOM State After Click**:
  - `buttonText`: Updated to `"Hint (+5m)"`
  - `hasHintContainerInCard`: `false`
  - Neither toast nor in-card hint text is rendered.
- **Root Cause**:
  `public/js/views/stages.js` lacks any container or rendering logic to display text hints in Stage 2. Furthermore, `server/routes/api/hints.js` returns `{ hint: hintText }`, while client code in parts of `stages.js` expects `{ text: hintText }`.

### Hint Reference Data (Database Inventory)
- **SQLite (`hint_config`)**: Exactly 10 rows seeded (Stages 1 through 5, hints 1 & 2). Stage 6 hints are missing completely!
- **Supabase Cloud (`hint_config`)**: 12 rows present in schema definition (Stages 1 through 6, hints 1 & 2).

---

## 0.4 R5 Stage 2 Answer Conflict & Security Leak

### Plaintext Contradiction
- In `server/content/mission.json`, `stage2.encodedText` is a multi-layer ciphertext:
  - Base64 -> Hexadecimal -> ROT13
- When fully decoded by the player, it reveals:
  `"ACCESS PHRASE IS CYGNUS. FRAGMENT TWO IS 8M4."`
- **The Problem**:
  `"FRAGMENT TWO IS 8M4."` tells the player that the answer is `8M4`.
  However, each team is assigned a unique randomized sequence of 4 parts (e.g. `PART-5: 7R`, `PART-1: 8M`, `PART-7: 9X`, `PART-3: 4K`) giving an 8-character assembled string (`7r8m9x4k`).
- Submitting `8M4` produces:
  `UI Feedback: "Incorrect attempt #1."` (HTTP 200 `{ correct: false, wrongAttempts: 1 }`).
- Submitting `8m4` produces:
  `UI Feedback: "Incorrect attempt #2."` (HTTP 200 `{ correct: false, wrongAttempts: 2 }`).
- The player is misled by the game's own decoded transmission!

### Vigenere Key Prefill Leak
- In `public/js/views/stages.js:381`:
  ```html
  <input type="text" id="vigenere-key-input" value="CYGNUS" placeholder="Key (e.g. CYGNUS)">
  ```
- In `public/js/utils/decoder.js:56`:
  ```javascript
  const key = (keyInput || 'CYGNUS').toUpperCase();
  ```
- The secret access phrase `"CYGNUS"` is prefilled in the input and defaulted in code, trivializing the multi-stage decoding process.

---

## 0.5 R2 Stage 1 Chart Completeness & Randomization

- `mission.json` currently defines `stage1.morseChart` with only **15 letters**:
  `A, B, C, D, E, M, N, O, R, S, T, U, V, W, Z`.
- 11 letters (`F, G, H, I, J, K, L, P, Q, X, Y`) are missing.
- The chart is currently static and identical across all teams, allowing collusion between teams.
- Requirement: All 26 letters (A–Z) must be present in the chart, and the letter-to-code assignment must be dynamically randomized per team based on a domain-separated HMAC PRNG seeded by team credentials.

---

## 0.6 R5 Stage 2 Layout & Computed Styles (Viewports 360, 768, 1366, 1920)

### Horizontal Overflow Audit
Playwright automated inspection detected horizontal scrolling across all tested viewport widths:

| Viewport Width | Overflowing Elements | Tags & Classes | ScrollWidth vs ClientWidth | Root Cause |
| :---: | :---: | :--- | :---: | :--- |
| **360px** | 3 | `.card.stage-enter`<br>`.cipher-raw-box`<br>`#stage2-cipher-raw` | 1216px vs 330px<br>1200px vs 298px<br>1200px vs 298px | Preformatted ciphertext string lacks `overflow-wrap: anywhere` and `white-space: pre-wrap`. Fixed minimum width in container. |
| **768px** | 3 | `.card.stage-enter`<br>`.cipher-raw-box`<br>`#stage2-cipher-raw` | 1228px vs 738px<br>1200px vs 682px<br>1200px vs 682px | Same un-wrapped ciphertext. |
| **1366px** | 3 | `.card.stage-enter`<br>`.cipher-raw-box`<br>`#stage2-cipher-raw` | 1228px vs 922px<br>1200px vs 866px<br>1200px vs 866px | Same un-wrapped ciphertext exceeding card boundaries. |
| **1920px** | 3 | `.card.stage-enter`<br>`.cipher-raw-box`<br>`#stage2-cipher-raw` | 1228px vs 922px<br>1200px vs 866px<br>1200px vs 866px | Same un-wrapped ciphertext. |

### Typography & Form Controls Audit
- **Workbench Controls**: Button and input heights vary between 32px and 48px; lack uniform 40px height standard.
- **Native Inputs**: Inputs default to user-agent styles without uniform dark theme tokens (`var(--surface)`, `var(--line)`).
- **Screenshots Captured**:
  - `docs/ui-review/stage2_before_1366.png`
  - `docs/ui-review/stage2_before_390.png`

---

## Conclusion & Action Plan
Every defect has been isolated and confirmed via browser automation and database introspection. The implementation will proceed in strict order:
1. **Task 1**: Extend Memorise Phase to 5 minutes (300 seconds) in configuration, state calculations, client rendering, and acceptance tests.
2. **Task 2**: Expand Morse Chart to 26 letters and implement per-team deterministic permutation PRNG.
3. **Task 3**: Fix Beacon Lamp CSS and JS event loop (class `.active`, no glow, drift correction, reduced motion).
4. **Task 4**: Implement unified hint service, idempotent reference data seeding (12 hints across Stages 1–6), atomic penalty transaction, and in-card hint countdown timer.
5. **Task 5**: Re-encrypt Stage 2 ciphertext to remove "8M4" contradiction, remove Vigenere key leak, enforce 2-column responsive layout, and handle case-insensitive / lowercase validation with polite warnings.
