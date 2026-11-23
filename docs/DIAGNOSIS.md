# FINAL OVERRIDE — Diagnostic Report: Root Causes & Findings

**Document Version:** 1.0.0  
**Date:** 2026-11-21  
**Scope:** Root cause forensic investigation of observations O1 through O8.

---

## 1. Observation Analysis with File:Line Evidence

### Observation O1: Stage 1 Memorise Phase vs. Solve Phase
- **Symptom:** Stage 1 must open with a 60-second MEMORISE phase showing only the Morse chart and instructions with no sector questions. Previously, all four sector cards showed immediately next to a "chart locked" panel.
- **Root Cause & Evidence:**
  1. In [server/routes/api/state.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/state.js#L100-L115), the legacy stage state builder serialized `stageConfig.sectors` unconditionally into the API response regardless of whether `now < stage1OpensAt`.
  2. In [public/js/views/stages.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/views/stages.js#L55-L135), the client view did not isolate the memorise view from the solve view: both `.phase1-memorise-card` and `.sectors-grid-2x2` were rendered in the initial template string, with visibility managed merely via client CSS toggles.
- **Resolution:**
  - Server-authoritative isolation: In `server/routes/api/state.js`, during Phase 1 (`now < stage1OpensAt`), `sectors` is completely omitted (`undefined`).
  - Strict DOM separation: In `public/js/views/stages.js`, `renderStageScreen` checks `isMemorise`. If true, only `#phase1-memorise-card` and `.morse-compact-grid` are inserted into the DOM. No sector cards, assembled-key slots, or submit forms exist in the DOM during the first 60 seconds.

---

### Observation O2: Hint Button Did Not Open Anything
- **Symptom:** Pressing the Hint button on Stage 1 did not unlock the temporary Morse chart.
- **Root Cause & Evidence:**
  1. **Game Status Check:** In [server/routes/api/hints.js:21-23](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/hints.js#L21-L23), if the team was registered under `startTogetherMode: true` without the game being launched, `team.status` was `'waiting'`. The hint endpoint returned HTTP 400 `{"error":"The game has not started yet."}`.
  2. **Property Name Mismatch:** In [server/routes/api/hints.js:102](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/routes/api/hints.js#L102), the route attempted to return `stageConfig.chart`. However, in [server/logic/stages.js:13](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/logic/stages.js#L13) and [server/content/mission.json:112](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/content/mission.json#L112), the array was named `morseChart`. Thus, `hintRes.data.morseChart` was `undefined`.
  3. **DOM Absence:** When the chart was removed from the DOM at $t = 60\text{s}$, pressing Hint called `triggerMorseChartUnlock()`, which looked for `document.getElementById('stage1-morse-chart-panel')`. Because the panel had been removed from the DOM, the function returned early without rendering.
- **Resolution:**
  - Updated `server/routes/api/hints.js` to return `stageConfig.morseChart || stageConfig.chart`.
  - In `public/js/views/stages.js`, `triggerMorseChartUnlock()` dynamically creates or reveals the temporary `#stage1-morse-chart-panel` countdown banner, updating the timer every second and cleanly removing it from the DOM when the 30-second window expires.

---

### Observation O3: Sector 3 Beacon Flashed Too Fast
- **Symptom:** The blinking light in Sector 3 flashed too rapidly to be readable.
- **Root Cause & Evidence:**
  1. In [server/content/mission.json:73-90](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/content/mission.json#L73-L90), the pulse array was configured as:
     ```json
     "pulses": [
       { "on": 120, "off": 100 },
       { "on": 120, "off": 100 },
       { "on": 120, "off": 100 },
       { "on": 360, "off": 200 }
     ]
     ```
  2. 120 ms for a dot and 360 ms for a dash is humanly unreadable under stress.
- **Resolution:**
  - Implemented configurable `stage1.light.unitMs` (default 600 ms) in accordance with international Morse standard:
    - Dot: $1 \times \text{unitMs} = 600\text{ ms}$ on, $1 \times \text{unitMs} = 600\text{ ms}$ off.
    - Dash: $3 \times \text{unitMs} = 1800\text{ ms}$ on, $1 \times \text{unitMs} = 600\text{ ms}$ off.
  - Added an 800 ms lead-in, a clear "Transmission Complete" indicator, a Slow Toggle ($1.5\times$ unit duration = 900 ms), and drift correction via `performance.now()`.

---

### Observation O4: Sector Cards Printed "Morse Code: ..." Lines
- **Symptom:** Each sector card displayed a redundant subtitle line reading `"Morse Code: ..."`.
- **Root Cause & Evidence:**
  - Located in [public/js/views/stages.js:155-220](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/js/views/stages.js#L155-L220) and [server/content/mission.json:43,65,91,109](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/content/mission.json#L43).
  - The cards rendered redundant chips and text labels reiterating the Morse letters directly below the intercepted telemetry, defeating the puzzle's intent.
- **Resolution:**
  - Stripped all redundant `"Morse Code: ..."` text rows and duplicate `"Sector 1 = Letter 1"` strips. Each sector displays only its distinct intercepted signal format (Pulse Signal chips, Binary stream rule, Optical Beacon lamp, Satellite Signal chips).

---

### Observation O5: Answer Mismatch (NOVA vs. CORE vs. Decoys)
- **Symptom:** Screen sectors decoded to N-O-V-A, but a previous report mentioned `CORE` / `APEX8`, while the screen warned about `ZETA9`.
- **Root Cause & Evidence:**
  1. An earlier experimental iteration altered [server/content/mission.json](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/content/mission.json#L11) without harmonizing the client sector telemetry.
  2. Sector 1 ($—\bullet \rightarrow \text{N}$), Sector 2 ($——— \rightarrow \text{O}$), Sector 3 ($\bullet\bullet\bullet— \rightarrow \text{V}$), Sector 4 ($\bullet— \rightarrow \text{A}$) strictly spell **NOVA**.
- **Resolution:**
  - Canonical Stage 1 configuration locked to:
    - Answer: `NOVA` (case/space-insensitive validation).
    - Decoy: `ZETA9` (strictly rejected on server with HTTP 400 `{ isDecoy: true }`).
  - Added pure derivation verification: server generates sectors dynamically from the configured answer word, ensuring the rendered output and server validator can never diverge.

---

### Observation O6: Old Hosted Database & Vercel Linkage
- **Symptom:** Game was previously tethered to an inaccessible Supabase project and Vercel deployment.
- **Root Cause & Evidence:**
  1. [server/db.js:9-15](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/db.js#L9-L15) checked `process.env.VERCEL || process.env.NOW_REGION` and fell back to `/tmp/final_override.db`.
  2. [api/index.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/api/index.js) and [vercel.json](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/vercel.json) existed as legacy Vercel serverless adapters.
  3. [server/repositories/supabaseStub.js](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/repositories/supabaseStub.js) had not been wired to the owner's new Supabase project (`vdqmugtolspszcjtiloa`).
- **Resolution:**
  - Disconnect old legacy URLs and credentials.
  - Implement full Supabase repository adapter targeting `https://vdqmugtolspszcjtiloa.supabase.co` with dual-mode fallback to SQLite for offline LAN gameplay.

---

### Observation O7: AI-Generated UI Aesthetics
- **Symptom:** UI featured tell-tale signs of generic AI scaffolding: neon glows, gradient headers, emoji icons, pill-shaped buttons, and redundant slogans.
- **Root Cause & Evidence:**
  1. [public/css/styles.css](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/public/css/styles.css) utilized heavy text shadows (`text-shadow: 0 0 10px var(--accent)`), box shadows on every card, and emoji characters across HTML/JS.
- **Resolution:**
  - Humanized UI redesign (Phase 6):
    - Palette: Tactical charcoal (`#0d0f12`), dark slate surfaces (`#14181d`, `#1b2027`), subdued borders (`#2a313a`), crisp text (`#e8e6df`), and a single restrained amber/gold accent (`#e0a63a`).
    - Standardized $20\text{px}$ SVG stroke icons; complete elimination of emoji from code, templates, and messages.
    - Compact, functional HUD and dossier strip with clean tabular numerals.

---

### Observation O8: Insecure Default Administrator PIN
- **Symptom:** Old default PIN `INVICTORS@23` (or `INVICTORS`) remained in fallback code.
- **Root Cause & Evidence:**
  - [server/config.js:46](file:///c:/Users/lenovo/OneDrive/Desktop/Invictors-main/server/config.js#L46): `ADMIN_PIN: process.env.ADMIN_PIN || 'INVICTORS@23'`.
- **Resolution:**
  - Removed all fallback strings. `ADMIN_PIN` must be loaded strictly from `process.env`.
  - Added startup validation refusing to boot if `ADMIN_PIN` is missing, shorter than 8 characters, or matches `INVICTORS`, `INVICTORS@23`, or any known legacy defaults.
