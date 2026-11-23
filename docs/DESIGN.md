# FINAL OVERRIDE — Humanised UI & Design System

This document specifies the visual identity, design tokens, typography, interaction models, and stage console architecture for **FINAL OVERRIDE** (Invictors Club, Dept. of CSE, VVCE Mysuru).

---

## 1. Design Philosophy: Humanised Tactical Espionage

FINAL OVERRIDE adopts a **tactical command-and-control aesthetic** inspired by aerospace operations consoles, cybersecurity incident rooms, and cinematic escape room terminals:
- **No Emojis**: Replaced entirely by crisp, monochrome, self-hosted SVGs (`#icon-*` sprite symbols in `public/index.html`).
- **High-Contrast Dark Theme**: Deep slate and obsidian backgrounds (`#0a0f1d`, `#0f172a`, `#1e293b`) that reduce visual fatigue during intense 90-minute competition sessions.
- **Color-Coded Status Accents**:
  - Emerald Green (`#10b981` / `#059669`): Verified solutions, unlocked stages, healthy connections.
  - Amber Gold (`#f59e0b` / `#d97706`): Warning alerts, active countdowns, hint unlock timers.
  - Ruby Red (`#ef4444` / `#dc2626`): Penalties, blocked commands, rate limit warnings.
  - Cyan Ice (`#06b6d4` / `#0891b2`): Active stage highlight, primary interactive focus.
- **Strict Monospace Numerical Alignment**: All countdowns, time counters, penalty displays, and cryptographic keys utilize `tabular-nums` and monospace fonts so numbers never jiggle or shift layout while counting.

---

## 2. Typography & Fonts

All font styles run 100% offline using local system fonts and bundled web fonts with zero external CDN dependencies:
- **Primary Body Font**: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Cryptographic & Monospace Font**: "JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, Monaco, Consolas, monospace.
- **Letter Spacing**: Extended tracking (`letter-spacing: 0.08em` to `0.2em`) for headers, status badges, and cryptographic input fields.

---

## 3. Global Navigation, HUD & Dossier Strip

### Site Header
- Institutional bar branding: **VIDYAVARDHAKA COLLEGE OF ENGINEERING — Dept. of Computer Science & Engineering**.
- Invictors Club logo and badge: **FINAL OVERRIDE — A Timed Team Escape-Room Style Tech Challenge**.

### Sticky Tactical HUD
The persistent status bar anchors to the top during gameplay:
- **Team**: Active squad identifier.
- **Stage**: Current stage indicator (`STAGE X / 6`).
- **Clock**: Elapsed mission time counter formatted as `MM:SS`.
- **Penalty**: Accumulated penalty minutes (`+Xm`).
- **Dossier Drawer Toggle**: Instant access to the intelligence drawer.
- **Progress Fill Bar**: Smooth progress indicator reflecting stage completion percentage.

### Master 6-Stage Tactical Rail
Displays all 6 stages sequentially with distinct visual states:
- `completed`: Highlighted with an emerald border and check icon.
- `active`: Highlighted with an azure glowing border and pulsating status pip.
- `locked`: Dimmed slate with lock icon.

Stages:
1. `1 Intercept` (Signal Intercept & Morse Matrix)
2. `2 Decode` (Decoding Matrix)
3. `3 WARDEN` (Prompt the AI)
4. `4 CTF` (CTF Challenges)
5. `5 Sync` (Team Sync & Multi-Device HMAC Link)
6. `6 Override` (Final Integration & Master Override)

### 6-Slot Intelligence Dossier Strip
Positioned directly below the stage rail, providing constant visibility of recovered cryptographic fragments:
- Exactly 6 equal-width slots corresponding to Stages 1 through 6.
- Each slot displays the recovered fragment code once unlocked, or a muted padlock when locked.
- Expanding the drawer reveals the **Squad Cryptanalysis Workspace & Notes** textarea (auto-saved to browser `localStorage`).

---

## 4. Stage 1 Two-Phase Design ("Morse Matrix")

Stage 1 is divided into two server-authoritative phases:

### Phase 1: MEMORISE (First 60 Seconds)
- **Isolation Guarantee**: The server does NOT send sector details, Morse values, or solve inputs.
- **Large Countdown & Draining Bar**: Large 60-second timer (`#phase1-countdown`) and animated progress bar (`#phase1-progress-bar-fill`) that drains over 60 seconds.
- **15-Letter Morse Reference Table**: 5x3 desktop grid (3 columns on mobile) displaying the 15 valid letters and their Dot/Dash patterns (`A, B, C, D, E, M, N, O, R, S, T, U, V, W, Z`).
- **Guidelines**: Memorisation tips instructing teams to study patterns, group similar rhythms, and prepare for decoding.

### Phase 2: SOLVE (After 60 Seconds)
- **Automatic Transition**: Chart disappears from the DOM (180ms CSS fade-in) and solver controls appear.
- **2x2 Sector Cards Grid**:
  - **Sector 1 (Pulse Signal)**: Dash + Dot chips showing Morse `— •` (Letter `N`).
  - **Sector 2 (Binary Code)**: Stream `111-0-111-0-111` with rule `111 = Dash`, `0 = Space`, 3 Dash chips showing Morse `— — —` (Letter `O`).
  - **Sector 3 (Blinking Light Beacon)**:
    - Status lamp (`#optical-beacon-lamp`) flashing 3 short blinks and 1 long blink (`• • • —`, Letter `V`).
    - Base pulse duration: 600ms unit (`unitMs: 600`), 800ms lead-in silence (`leadInMs: 800`).
    - Slow speed toggle (1.5x speed / 900ms unit).
    - Status badges: "READY", "FLASHING...", and an emerald "Transmission ended" badge on finish.
    - Decoy Trap Alert: Warning squads to ignore potential optical decoy `ZETA9`.
  - **Sector 4 (Satellite Signal)**: Dot + Dash chips showing Morse `• —` (Letter `A`).
- **4-Box Assembled Key Panel**:
  - 4 single-letter input boxes (`letter-0` through `letter-3`).
  - **Auto-Advance**: Typing into box 0 advances focus to box 1, etc.
  - **Backspace Navigation**: Pressing Backspace on an empty box returns focus to the preceding box.
  - **Paste Handling**: Pasting "NOVA" distributes across all 4 boxes, converts to uppercase, and syncs to the master submission field.
  - **Enter Key**: Triggers submission directly from any box.
- **Temporary Hint Unlock**: Hint button unlocks the 15-letter chart for 30 seconds with a visible countdown badge before automatically hiding again.

---

## 5. Stages 2 to 6 Consoles

### Stage 2: Decoding Matrix & Cryptanalyst Workbench
- Displays the team's deterministic assembly order and the encrypted 3-layer cipher.
- Interactive Cryptanalyst Workbench with one-click transformation modules: Base64 Decode, Hex Decode, ROT13, Atbash, Reverse, Caesar Shift (-25 to +25 with preview), and Undo/Reset history stack.

### Stage 3: WARDEN AI Terminal
- Terminal-styled chat window interfacing with the WARDEN security subsystem.
- Employs the deterministic rule engine by default (validating military role, access phrase from Stage 2, operational directive, complete sentences, and blocking brute-force attempts).

### Stage 4: CTF Challenges & Cyber Terminal
- Capture The Flag technical concepts briefing (HTML comments, robots.txt, EXIF metadata, directory traversal).
- Full interactive cyber terminal supporting commands: `help`, `ls`, `cat`, `exif`, `curl`, `whoami`, `clear`, with command history navigation (`ArrowUp` / `ArrowDown`).

### Stage 5: Team Sync & Multi-Device HMAC Link
- Mandates multi-device connection across all squad operatives (3 or 4 players).
- Displays live connection status chips for each teammate (`CONNECTED` vs `WAITING`).
- Displays the leader's unique HMAC shard and gives instructions to concatenate all shards in registration order separated by dashes.

### Stage 6: Final Integration & Master Override
- 5-slot Synthesis Matrix displaying all 5 recovered fragments (`f1` through `f5`).
- Target Hosts Clearance status badges.
- Master Override computation formula: `FO{f4-f2-f1-rev(f3)-f5_no_dashes}#digitSum`.

---

## 6. Accessibility & Responsiveness

- **WCAG AA Compliance**: High-contrast text ratios exceeding 4.5:1 on all surfaces.
- **Responsive Layout**:
  - Desktops (>= 1366px): 4-column sector cards and full 5-column stage posters.
  - Tablets (768px - 1365px): 2x2 sector cards grid.
  - Mobile Devices (320px - 767px): Single-column stacked cards, full touch-friendly button targets (minimum 44x44px).
- **Keyboard Navigation**: Full focus styling with visible focus outlines (`focus-visible: 2px solid var(--accent-primary)`).
