// FINAL OVERRIDE — Master 5-Stage Tactical Console Views (ES Module)
// Tactical HUD styling, zero emoji, self-hosted SVGs, in-place patching.
import { esc } from './lobby.js';

let activeRenderedStage = null;
let activeRenderedTeamId = null;
let lastRenderedNotebookStr = '';
let morseChartTimer = null;
let stage1LockTimer = null;

// Stage 4 Terminal Command History
const terminalCmdHistory = [];
let terminalHistoryIndex = -1;

export const STAGE_META = {
  1: {
    title: 'Stage 1: Signal Intercept & Morse Matrix',
    objective: 'Intercept the optical/binary beacon and reconstruct the four sector coordinates.'
  },
  2: {
    title: 'Stage 2: Decoding',
    objective: "Intercept and decrypt the multi-layered communication stream to recover your squad's access phrase."
  },
  3: {
    title: 'Stage 3: Neural Warden Comms Protocol',
    objective: 'Authorize with WARDEN through formal protocol to retrieve the AI core fragment.'
  },
  4: {
    title: 'Stage 4: Capture The Flag',
    objective: 'Investigate file endpoints, inspect metadata, and capture the three hidden security tokens.'
  },
  5: {
    title: 'Stage 5: Team Sync & Multi-Device HMAC Link',
    objective: 'Synchronize all squad devices simultaneously to generate the linked HMAC token.'
  },
  6: {
    title: 'Stage 6: Master System Integration & Final Override',
    objective: 'Synthesize all five fragments and calculate the final master clearance code.'
  }
};

export function renderNotebookHtml() {
  // Redesigned: dossier is now a dedicated compact strip directly under the HUD.
  // Stage cards focus entirely on the active challenge without duplicate locked stage lists.
  return '';
}

function renderMorseGlyphs(codeStr) {
  const clean = String(codeStr || '').replace(/\s+/g, '');
  const items = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '•' || ch === '.' || ch === '·') {
      items.push('<svg class="morse-glyph-svg dot" width="6" height="6" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg>');
    } else if (ch === '—' || ch === '-' || ch === '–' || ch === '_') {
      items.push('<svg class="morse-glyph-svg dash" width="16" height="6" viewBox="0 0 16 6" aria-hidden="true"><rect width="16" height="6" rx="2" fill="currentColor"/></svg>');
    }
  }
  return items.join('');
}

function patternToSpoken(codeStr) {
  const clean = String(codeStr || '').replace(/\s+/g, '');
  const words = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '•' || ch === '.' || ch === '·') words.push('dot');
    else if (ch === '—' || ch === '-' || ch === '–' || ch === '_') words.push('dash');
  }
  return words.join(' ');
}

function renderMorseTableHtml(chart) {
  if (!chart || !Array.isArray(chart)) return '';
  return `
    <div class="morse-compact-grid" role="grid" aria-label="Morse Code Alphabet Table">
      ${chart.map(m => {
        const spoken = patternToSpoken(m.code);
        return `
          <div class="morse-tile" data-letter="${esc(m.letter)}" role="gridcell" aria-label="${esc(m.letter)}: ${spoken}">
            <span class="tile-letter">${esc(m.letter)}</span>
            <div class="morse-glyphs-container" aria-hidden="true">
              ${renderMorseGlyphs(m.code)}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSectorCards(sectors) {
  if (!sectors) return '';
  const sectorList = Array.isArray(sectors) ? sectors : Object.values(sectors);
  if (!Array.isArray(sectorList) || sectorList.length === 0) {
    return '';
  }

  return `
    <div class="sectors-grid-2x2">
      ${sectorList.map((sec, idx) => {
        const secId = sec.id != null ? Number(sec.id) : (idx + 1);
        if (secId === 1) {
          return `
            <div class="sector-card" data-sector-id="1">
              <div class="sector-header">
                <span class="sector-id">${esc(sec.name || sec.label || 'SECTOR 1')}</span>
                <span class="sector-badge">${esc(sec.type || sec.badge || 'PULSE SIGNAL')}</span>
              </div>
              <p class="sector-desc">${sec.desc || (sec.signal ? 'Signal: ' + esc(sec.signal) : '')}</p>
              <div class="pulse-chip-container">
                ${(sec.chips || []).map((c, i) => `
                  ${i > 0 ? '<span class="chip-sep">+</span>' : ''}
                  <div class="morse-chip chip-${c.type}">${esc(c.label)}</div>
                `).join('')}
              </div>
            </div>
          `;
        } else if (secId === 2) {
          return `
            <div class="sector-card" data-sector-id="2">
              <div class="sector-header">
                <span class="sector-id">${esc(sec.name || sec.label || 'SECTOR 2')}</span>
                <span class="sector-badge">${esc(sec.type || sec.badge || 'BINARY CODE')}</span>
              </div>
              <p class="sector-desc">${sec.desc || (sec.binary ? 'Binary: ' + esc(sec.binary) : '')}</p>
              <div class="pulse-chip-container">
                ${(sec.chips || []).map(c => `
                  <div class="morse-chip chip-${c.type}">${esc(c.label)}</div>
                `).join('')}
              </div>
            </div>
          `;
        } else if (secId === 3) {
          return `
            <div class="sector-card" data-sector-id="3">
              <div class="sector-header">
                <span class="sector-id">${esc(sec.name || sec.label || 'SECTOR 3')}</span>
                <span class="sector-badge">${esc(sec.type || sec.badge || 'BLINKING LIGHT')}</span>
              </div>
              <p class="sector-desc">${sec.desc || (sec.flashes ? 'Optical: ' + esc(sec.flashes) : '')}</p>
              <div class="beacon-control-box">
                <div class="beacon-indicator-group">
                  <div id="optical-beacon-lamp" class="beacon-lamp" role="status" aria-label="Optical beacon"></div>
                  <span id="optical-beacon-status" class="beacon-status-label">READY</span>
                  <span id="optical-beacon-ended" class="transmission-ended-badge" style="display: none;">DONE</span>
                </div>
                <div class="beacon-controls-row">
                  <button type="button" id="btn-trigger-strobe" class="btn btn-outline btn-sm">▶ Watch Light Blink</button>
                  <label class="beacon-slow-toggle">
                    <input type="checkbox" id="beacon-slow-check" />
                    <span>Slow speed (1.5x)</span>
                  </label>
                </div>
              </div>
            </div>
          `;
        } else if (secId === 4) {
          return `
            <div class="sector-card" data-sector-id="4">
              <div class="sector-header">
                <span class="sector-id">${esc(sec.name || sec.label || 'SECTOR 4')}</span>
                <span class="sector-badge">${esc(sec.type || sec.badge || 'SATELLITE SIGNAL')}</span>
              </div>
              <p class="sector-desc">${sec.desc || (sec.signal ? 'Signal: ' + esc(sec.signal) : '')}</p>
              <div class="pulse-chip-container">
                ${(sec.chips || []).map((c, i) => `
                  ${i > 0 ? '<span class="chip-sep">+</span>' : ''}
                  <div class="morse-chip chip-${c.type}">${esc(c.label)}</div>
                `).join('')}
              </div>
            </div>
          `;
        }
        return '';
      }).join('')}
    </div>
  `;
}

export function renderStageScreen(container, state, controller) {
  const team = state.team;
  const stage = team.stage;
  const content = state.stageContent || {};
  const prog = state.currentProg || { wrongAttempts: 0, hintsUsed: 0 };
  const notebook = state.notebook || {};

  // If the same team and stage is already rendered, patch in-place to avoid full-page blinks
  if (activeRenderedTeamId === team.id && activeRenderedStage === stage) {
    patchStageInPlace(state);
    return;
  }

  activeRenderedTeamId = team.id;
  activeRenderedStage = stage;
  lastRenderedNotebookStr = JSON.stringify(notebook);
  if (morseChartTimer) {
    clearInterval(morseChartTimer);
    morseChartTimer = null;
  }
  if (stage1LockTimer) {
    clearInterval(stage1LockTimer);
    stage1LockTimer = null;
  }

  const meta = STAGE_META[stage] || { title: `Mission ${stage} of 6`, objective: 'Complete mission objective.' };
  let stageTitleText = meta.title;
  let stageObjectiveText = meta.objective;
  let specificHtml = '';
  let placeholderText = 'Enter verification fragment';

  if (stage === 1) {
    placeholderText = 'Enter 4-letter vault code';

    const s1 = content || {};
    const isPhase1 = s1.phase === 'memorise' || (s1.lockRemainingMs || 0) > 0;
    const morseChart = s1.morseChart || s1.chart || [
      { letter: 'A', code: '• —' },
      { letter: 'B', code: '— • • •' },
      { letter: 'C', code: '— • — •' },
      { letter: 'D', code: '— • •' },
      { letter: 'E', code: '•' },
      { letter: 'F', code: '• • — •' },
      { letter: 'G', code: '— — •' },
      { letter: 'H', code: '• • • •' },
      { letter: 'I', code: '• •' },
      { letter: 'J', code: '• — — —' },
      { letter: 'K', code: '— • —' },
      { letter: 'L', code: '• — • •' },
      { letter: 'M', code: '— —' },
      { letter: 'N', code: '— •' },
      { letter: 'O', code: '— — —' },
      { letter: 'P', code: '• — — •' },
      { letter: 'Q', code: '— — • —' },
      { letter: 'R', code: '• — •' },
      { letter: 'S', code: '• • •' },
      { letter: 'T', code: '—' },
      { letter: 'U', code: '• • —' },
      { letter: 'V', code: '• • • —' },
      { letter: 'W', code: '• — —' },
      { letter: 'X', code: '— • • —' },
      { letter: 'Y', code: '— • — —' },
      { letter: 'Z', code: '— — • •' }
    ];

    if (isPhase1) {
      const totalMemoriseSec = s1.memoriseSeconds || 300;
      const initialSeconds = Math.max(0, Math.ceil((s1.lockRemainingMs || (s1.stage1OpensAt ? s1.stage1OpensAt - Date.now() : totalMemoriseSec * 1000)) / 1000));
      const progressPct = Math.min(100, Math.max(0, Math.round((initialSeconds / totalMemoriseSec) * 100)));
      const formatMmSs = (s) => {
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
      };
      const mem = s1.memorise || {
        title: 'PHASE 1: MEMORISE THE CODE',
        text: 'MEMORISE THE CODE. You have 5 minutes. The chart will close, and the mission starts when the timer ends. You will need these letters and their patterns to decode the four sectors. Take note of the patterns now.',
        guidelines: [
          'Study the pattern for each letter carefully.',
          'Group the letters that look alike or share complementary rhythms.',
          'Learn to match patterns quickly under pressure.'
        ]
      };

      specificHtml = `
        <!-- Phase 1: MEMORISE Instruction Panel -->
        <div class="phase1-memorise-card">
          <div class="phase1-header">
            <div class="phase1-title">
              <svg class="ui-icon" width="20" height="20"><use href="#icon-clock"></use></svg>
              <span>${esc(mem.title)}</span>
            </div>
            <div id="phase1-countdown" class="phase1-countdown-large tabular-nums">${formatMmSs(initialSeconds)} (${initialSeconds}s)</div>
          </div>
          <div class="phase1-progress-bar-track">
            <div id="phase1-progress-bar-fill" class="phase1-progress-bar-fill" style="width: ${progressPct}%;"></div>
          </div>
          <p class="phase1-body-text">${esc(mem.text)}</p>
          <ul class="phase1-guidelines">
            ${(mem.guidelines || []).map(g => `<li>${esc(g)}</li>`).join('')}
          </ul>
        </div>

        <!-- Compact 26-Letter Morse Reference Grid (7 cols desktop, 4 cols mobile) -->
        <div class="morse-chart-panel">
          <div class="morse-chart-header">
            <div class="chart-title-group">
              <svg class="ui-icon" width="20" height="20"><use href="#icon-signal"></use></svg>
              <span>Morse Reference Table (26 Alphabets)</span>
            </div>
          </div>
          ${renderMorseTableHtml(morseChart)}
        </div>
      `;
    } else {
      // Phase 2: SOLVE
      const intro = s1.intro || {
        title: 'MISSION 1: DECODE THE 4-LETTER VAULT CODE',
        text: 'The vault door is locked with a secret 4-letter password. Our radio antenna intercepted 4 signals (Sector 1, 2, 3, and 4). Each sector gives you exactly 1 letter in Morse code.'
      };

      specificHtml = `
        <!-- Intro Card -->
        <div class="intro-briefing-card">
          <div class="intro-header">
            <svg class="ui-icon" width="20" height="20"><use href="#icon-signal"></use></svg>
            <span>${esc(intro.title)}</span>
          </div>
          <p class="intro-body">${intro.text}</p>
        </div>

        <!-- 2x2 Grid of Sector Cards (4 across >= 1366px, 2x2 on tablets, 1 col on phones) -->
        ${renderSectorCards(s1.sectors)}

        <!-- Live 4-Sector Assembled Key Panel with Direct Letter Inputs -->
        <div class="assembled-key-panel">
          <div class="assembled-key-header">
            <span class="panel-label">4-SECTOR ASSEMBLED KEY:</span>
            <span class="panel-sub">Letter 1 to 4 in order</span>
          </div>
          <div class="assembled-slots-row">
            <div class="slot-column">
              <label for="letter-0" class="slot-label">Letter 1</label>
              <div id="slot-preview-1" class="slot-box">
                <input type="text" class="sector-letter-input" id="letter-0" maxlength="1" aria-label="Letter 1" autocomplete="off" autofocus />
                <span id="slot-val-1" style="display: none;">?</span>
              </div>
            </div>
            <div class="slot-column">
              <label for="letter-1" class="slot-label">Letter 2</label>
              <div id="slot-preview-2" class="slot-box">
                <input type="text" class="sector-letter-input" id="letter-1" maxlength="1" aria-label="Letter 2" autocomplete="off" />
                <span id="slot-val-2" style="display: none;">?</span>
              </div>
            </div>
            <div class="slot-column">
              <label for="letter-2" class="slot-label">Letter 3</label>
              <div id="slot-preview-3" class="slot-box">
                <input type="text" class="sector-letter-input" id="letter-2" maxlength="1" aria-label="Letter 3" autocomplete="off" />
                <span id="slot-val-3" style="display: none;">?</span>
              </div>
            </div>
            <div class="slot-column">
              <label for="letter-3" class="slot-label">Letter 4</label>
              <div id="slot-preview-4" class="slot-box">
                <input type="text" class="sector-letter-input" id="letter-3" maxlength="1" aria-label="Letter 4" autocomplete="off" />
                <span id="slot-val-4" style="display: none;">?</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  } else if (stage === 2) {
    placeholderText = 'enter answer in lowercase';
    const fragments = content.fragments || [1, 3, 5, 7];
    const baseFragments = content.baseFragments || content.parts || [
      { id: 1, label: 'PART-1', code: '8M' },
      { id: 3, label: 'PART-3', code: '4K' },
      { id: 5, label: 'PART-5', code: '7R' },
      { id: 7, label: 'PART-7', code: '9X' }
    ];
    const modules = content.modules || [
      { id: 'rot13', index: 1, label: 'ROT13' },
      { id: 'base64', index: 2, label: 'Base64' },
      { id: 'hex', index: 3, label: 'Hex' },
      { id: 'atbash', index: 4, label: 'Atbash' },
      { id: 'reverse', index: 5, label: 'Reverse' },
      { id: 'caesar', index: 6, label: 'Caesar (shift 3)' }
    ];
    const howToPlay = content.howToPlay || [
      'Copy or paste the intercepted payload into the workbench input.',
      'Inspect the character set to identify which encoding was applied last.',
      'Apply that decoder by clicking its numbered button (each can be used once).',
      'Repeat for each layer until you reveal readable English that looks scrambled by a substitution cipher.',
      'Take the sequence of decoder numbers you used, in the exact order you clicked them (for example 2, 3, 1 becomes 231).',
      'Enter that number sequence into the Vigenère key input and click \'Decode with key\'.',
      'Read the access phrase, then assemble your team\'s assigned part numbers in the exact order shown on the left.'
    ];

    specificHtml = `
      <div class="stage2-layout-grid">
        <!-- Left column: Briefing & Intelligence -->
        <div class="stage2-col-left">
          <div class="intro-briefing-card">
            <div class="intro-header">
              <svg class="ui-icon" width="20" height="20"><use href="#icon-cipher"></use></svg>
              <span>Stage 2: Decoding</span>
            </div>
            <p class="intro-body">
              Intercept and decrypt the multi-layered communication stream to recover your squad's access phrase.
            </p>
            <div class="how-to-play-section">
              <div class="sequence-title">HOW TO PLAY:</div>
              <ol class="how-to-play-list">
                ${howToPlay.map(step => `<li>${esc(step)}</li>`).join('')}
              </ol>
            </div>
          </div>

          <!-- Team Deterministic Assembly Sequence -->
          <div class="sequence-order-card">
            <div class="sequence-title">TEAM DETERMINISTIC ASSEMBLY SEQUENCE:</div>
            <div class="parts-tiles-grid">
              ${fragments.map((fragId, idx) => {
      const fragObj = baseFragments.find(f => f.id === fragId) || { label: `PART-${fragId}`, code: '??' };
      return `
                  <div class="part-tile">
                    <span class="chip-step-num">Step ${idx + 1}</span>
                    <span class="chip-frag-label">${esc(fragObj.label)}</span>
                    <span class="chip-frag-code">${esc(fragObj.code)}</span>
                  </div>
                `;
    }).join('')}
            </div>
            <div class="lowercase-notice-banner" style="margin-top: 12px;">
              <svg class="ui-icon" width="14" height="14"><use href="#icon-alert"></use></svg>
              <span>IMPORTANT: Assemble fragments according to your team order and enter your final answer strictly in lowercase.</span>
            </div>
          </div>

          <!-- Intercepted Cryptographic Payload -->
          <div class="cipher-raw-box">
            <div class="cipher-box-header">
              <span>Intercepted Cryptographic Payload:</span>
              <button id="btn-copy-payload" class="btn btn-outline btn-h36" type="button" title="Copy payload to clipboard">Copy Payload</button>
            </div>
            <div id="stage2-cipher-raw" class="cipher-raw-text">${esc(content.encodedText || content.payload || '')}</div>
          </div>
        </div>

        <!-- Right column: Cryptanalyst Workbench -->
        <div class="stage2-col-right">
          <div class="toolkit-box">
            <div class="toolkit-header">
              <div class="toolkit-title">
                <svg class="ui-icon" width="16" height="16"><use href="#icon-terminal"></use></svg>
                <span>Cryptanalyst workbench</span>
              </div>
              <div class="toolkit-controls">
                <button id="btn-paste-original" class="btn btn-outline btn-h40" type="button">Paste payload</button>
                <button id="btn-undo-step" class="btn btn-outline btn-h40" type="button">
                  <svg class="ui-icon" width="14" height="14"><use href="#icon-undo"></use></svg>
                  <span>Undo</span>
                </button>
                <button id="btn-reset-workbench" class="btn btn-outline btn-h40 btn-danger-outline" type="button">Reset</button>
              </div>
            </div>

            <textarea id="toolkit-input" rows="4" class="toolkit-textarea" readonly placeholder="Click 'Paste payload' to begin cryptanalysis..."></textarea>

            <div class="toolkit-section-label" style="margin-top: 10px;">DECODER MODULES (SINGLE-USE):</div>
            <div id="stage2-decoders-row" class="stage2-decoder-row">
              ${modules.map(m => `
                <button id="btn-module-${m.index}" class="stage2-decoder-btn" data-index="${m.index}" data-id="${esc(m.id)}" type="button">
                  <span class="stage2-decoder-badge">${m.index}</span>
                  <span class="module-label">${esc(m.label)}</span>
                </button>
              `).join('')}
            </div>

            <!-- Output Area with Copy Button -->
            <div class="toolkit-output-container">
              <div class="output-header-row">
                <span class="output-label">OUTPUT:</span>
                <button id="btn-copy-output" class="btn btn-outline btn-h36" type="button">
                  <svg class="ui-icon" width="14" height="14"><use href="#icon-copy"></use></svg>
                  <span>Copy Output</span>
                </button>
              </div>
              <div id="toolkit-output" class="toolkit-output-box">(Results will appear here)</div>
            </div>

            <!-- Sequence chips row -->
            <div class="stage2-sequence-wrapper">
              <span class="stage2-sequence-label">Sequence:</span>
              <div id="toolkit-sequence-chips" class="stage2-sequence-chips">
                <span class="seq-empty" style="color: var(--text-muted); font-size: 0.8rem;">(None applied)</span>
              </div>
            </div>

            <!-- Inline error banner -->
            <div id="toolkit-error" class="feedback-line error" style="min-height: 20px;"></div>

            <!-- Numeric Vigenère input & decode button -->
            <div class="vigenere-box-container">
              <label for="vigenere-key-input" class="vigenere-input-label">Numeric Vigen&egrave;re Key ([1-9] only, max 12 digits):</label>
              <div class="vigenere-input-row">
                <input type="text" id="vigenere-key-input" class="input-control tabular-nums btn-h40" inputmode="numeric" pattern="[1-9]*" maxlength="12" placeholder="Enter sequence digits (e.g. 231)" />
                <button id="btn-vigenere-apply" class="btn btn-primary btn-h40" type="button">Decode with key</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (stage === 3) {
    placeholderText = 'Enter 6-char fragment';
    specificHtml = `
      <div class="intro-briefing-card">
        <div class="intro-header">
          <svg class="ui-icon" width="18" height="18"><use href="#icon-terminal"></use></svg>
          <span>STAGE 3: NEURAL WARDEN COMMS PROTOCOL</span>
        </div>
        <p class="intro-body">
          WARDEN safeguards the third fragment. It demands full military protocol authorization: declare your official role, provide the access phrase discovered in Stage 2, and specify an unambiguous operational directive in complete sentences. Beware of decoy fragments!
        </p>
      </div>

      <div class="chat-wrapper">
        <div id="chat-window" class="chat-window">
          <div class="chat-bubble warden">
            WARDEN AI v2.6 PROTOCOL ACTIVE. Transmit your authorization credentials and operational mission statement.
          </div>
        </div>
        <div class="chat-input-row">
          <input type="text" id="warden-msg-input" class="input-control" placeholder="Transmit authorization message to WARDEN..." />
          <button id="btn-send-warden" class="btn btn-primary">Transmit</button>
        </div>
      </div>
    `;
  } else if (stage === 4) {
    placeholderText = 'Enter 3-character combined token';
    const briefing = content.briefing || {
      objective: 'Recover three distributed verification tokens (Token 1, Token 2, Token 3) concealed inside system layers and concatenate them in numerical order.',
      technicalConcepts: [
        { term: 'HTML Comments', definition: 'Invisible notes in source markup syntax (<!-- ... -->) accessible via Developer Tools.' },
        { term: 'Robots.txt', definition: 'A standard web crawler directive file that often reveals hidden endpoints.' },
        { term: 'Metadata / EXIF', definition: 'Embedded attributes inside media files containing origin metadata.' },
        { term: 'Directory Traversal', definition: 'An exploit attempting access outside webroot via ../ sequences, strictly blocked.' }
      ],
      rules: "Enter commands into the cyber terminal console. Type 'help' for available system commands.",
      howToStart: 'Inspect page source for Token 1, investigate file endpoints with terminal for Token 2, and inspect badge metadata for Token 3.'
    };

    specificHtml = `
      <!-- Comprehensive Topic Briefing Card -->
      <div class="topic-briefing-box">
        <div class="briefing-title">
          <svg class="ui-icon" width="18" height="18"><use href="#icon-flag"></use></svg>
          <span>MISSION 4: CAPTURE THE FLAG BRIEFING</span>
        </div>
        <p class="briefing-objective"><strong>OBJECTIVE:</strong> ${esc(briefing.objective)}</p>
        
        <div class="technical-concepts-grid">
          ${(briefing.technicalConcepts || []).map(c => `
            <div class="concept-card">
              <span class="concept-term">${esc(c.term)}</span>
              <span class="concept-def">${esc(c.definition)}</span>
            </div>
          `).join('')}
        </div>

        <div class="briefing-footer-notes">
          <div><strong>RULES OF ENGAGEMENT:</strong> ${esc(briefing.rules)}</div>
          <div><strong>STARTING VECTORS:</strong> ${esc(briefing.howToStart)}</div>
        </div>
      </div>

      <!-- Dynamic token injection anchor -->
      <div id="stage-4-secret-anchor" style="display: none;"></div>

      <!-- Cyber Terminal Shell -->
      <div class="terminal-box">
        <div class="terminal-bar">
          <span class="term-status-dot"></span>
          <span class="term-title">INVICTORS CYBER TERMINAL v2.6 &mdash; Type 'help' for commands, 'clear' to reset</span>
        </div>
        <pre id="terminal-history" class="terminal-history"></pre>
        <div class="terminal-input-row">
          <span class="terminal-prompt">$</span>
          <input type="text" id="terminal-cmd-input" class="terminal-input" placeholder="ls, cat &lt;file&gt;, exif &lt;file&gt;, clear..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        </div>
      </div>
    `;
  } else if (stage === 5) {
    const joined = content.joinedCount || 0;
    const total = content.totalMembers || (state.team ? state.team.memberCount : (state.members ? state.members.length : 3));
    const exampleParts = Array.from({ length: total }, (_, i) => `SHARD${i + 1}`).join('-');
    placeholderText = exampleParts;

    specificHtml = `
      <div class="intro-briefing-card">
        <div class="intro-header">
          <svg class="ui-icon" width="18" height="18"><use href="#icon-users"></use></svg>
          <span>STAGE 5: TEAM SYNC &amp; MULTI-DEVICE HMAC LINK</span>
        </div>
        <p class="intro-body">
          <strong>Stage 5 requires every team member to connect from their individual device.</strong> Each teammate must access this portal on their own laptop and enter the team name under &ldquo;Joining as a team member&rdquo; to discover their unique authorization shard.
        </p>
      </div>

      <!-- Squad Link Console -->
      <div class="squad-link-console">
        <div class="console-header">SQUAD DEVICE SYNCHRONIZATION MATRIX</div>
        <div class="squad-members-grid">
          ${(content.members || (state.members || [])).map(m => `
            <div class="squad-member-badge ${m.joined ? 'joined' : 'pending'}">
              <svg class="ui-icon" width="14" height="14"><use href="${m.joined ? '#icon-check' : '#icon-clock'}"></use></svg>
              <span class="member-name">${esc(m.fullName)}</span>
              <span class="member-status-chip">${m.joined ? 'CONNECTED' : 'WAITING'}</span>
            </div>
          `).join('')}
        </div>
        <div class="squad-progress-summary">
          Squad members linked: <strong id="stage5-joined-count" class="tabular-nums">${joined} / ${total}</strong>
        </div>

        <div class="leader-shard-box">
          <div class="shard-box-label">Your Shard (This Device):</div>
          <div class="shard-value tabular-nums">${esc(content.leaderShard || '---')}</div>
        </div>

        <div class="machine-hint-box">
          <svg class="ui-icon" width="16" height="16"><use href="#icon-alert"></use></svg>
          <span>Combine all ${total} squad shards in registration order separated by dashes: <code>${exampleParts}</code>.</span>
        </div>
      </div>
    `;
  } else if (stage === 6) {
    placeholderText = 'Enter final override key FO{...}#sum';
    const machineNames = content.machineNames || ['serverAlpha', 'gridNode01', 'coreRelay', 'nexusVault'];

    const f1 = notebook[1] || 'NOVA';
    const f2 = notebook[2] || '8m4k7r9x';
    const f3 = notebook[3] || 'ZENITH';
    const f4 = notebook[4] || '47K';
    const f5 = notebook[5] || 'TEAM-SYNC-CODE';

    specificHtml = `
      <div class="intro-briefing-card">
        <div class="intro-header">
          <svg class="ui-icon" width="18" height="18"><use href="#icon-lock"></use></svg>
          <span>STAGE 6: MASTER SYSTEM INTEGRATION &amp; FINAL OVERRIDE</span>
        </div>
        <p class="intro-body">
          All five cryptographic security fragments have been intercepted across the defense sectors. Synthesize the recovered intelligence, align authorization parameters with target machines, and compute the master clearance key to unlock the vault.
        </p>
      </div>

      <!-- Recovered Fragments Matrix -->
      <div class="sequence-order-card">
        <div class="sequence-title">SYNTHESIS MATRIX — RECOVERED SECTOR FRAGMENTS:</div>
        <div class="sequence-chips-row">
          <div class="sequence-chip">
            <span class="chip-step-num">Stage 1</span>
            <span class="chip-frag-label">Morse</span>
            <span class="chip-frag-code tabular-nums">${esc(f1)}</span>
          </div>
          <div class="sequence-chip">
            <span class="chip-step-num">Stage 2</span>
            <span class="chip-frag-label">Sequence</span>
            <span class="chip-frag-code tabular-nums">${esc(f2)}</span>
          </div>
          <div class="sequence-chip">
            <span class="chip-step-num">Stage 3</span>
            <span class="chip-frag-label">WARDEN</span>
            <span class="chip-frag-code tabular-nums">${esc(f3)}</span>
          </div>
          <div class="sequence-chip">
            <span class="chip-step-num">Stage 4</span>
            <span class="chip-frag-label">CTF</span>
            <span class="chip-frag-code tabular-nums">${esc(f4)}</span>
          </div>
          <div class="sequence-chip">
            <span class="chip-step-num">Stage 5</span>
            <span class="chip-frag-label">Team Sync</span>
            <span class="chip-frag-code tabular-nums">${esc(f5)}</span>
          </div>
        </div>
      </div>

      <!-- Target Hosts Clearance Overview -->
      <div class="squad-link-console">
        <div class="console-header">FACILITY TARGET HOSTS AWAITING CLEARANCE</div>
        <div class="squad-members-grid">
          ${machineNames.map(m => `
            <div class="squad-member-badge pending">
              <svg class="ui-icon" width="14" height="14"><use href="#icon-terminal"></use></svg>
              <span class="member-name">${esc(m)}</span>
              <span class="member-status-chip">STANDBY</span>
            </div>
          `).join('')}
        </div>
        <div class="machine-hint-box" style="margin-top: 14px;">
          <svg class="ui-icon" width="16" height="16"><use href="#icon-alert"></use></svg>
          <span>Master Authorization Formula: <code>FO{CTF-Decoding-Morse-rev(AI)-TeamSyncNoDashes}#digitSum</code>. Checksum is the sum of all numerical digits within the bracketed key.</span>
        </div>
      </div>
    `;
  }

  const isStage1 = stage === 1;
  const isPhase1 = isStage1 && (content.phase === 'memorise' || (content.lockRemainingMs || 0) > 0);
  const activeHintWindowSec = isStage1 && content.chartVisibleUntil && content.chartVisibleUntil > Date.now()
    ? Math.ceil((content.chartVisibleUntil - Date.now()) / 1000)
    : 0;

  const formatMmSs = (s) => {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  // Render outer stage card
  container.innerHTML = `
    <div id="banner-slot" class="banner-slot"></div>

    <div class="card stage-enter">
      <div class="stage-card-header">
        <div>
          <span class="active-stage-label">STAGE ${stage} OF 6</span>
          <h2 class="active-stage-title">${esc(stageTitleText)}</h2>
          <p class="stage-objective-subtitle">${esc(stageObjectiveText)}</p>
        </div>
        <div class="stage-header-actions">
          ${isPhase1 ? '' : `
            <button id="btn-request-hint" class="btn btn-sm btn-outline btn-warning" ${
              isStage1 ? (activeHintWindowSec > 0 ? 'disabled' : '') : (prog.hintsUsed >= 2 ? 'disabled' : '')
            }>
              <svg class="ui-icon" width="16" height="16"><use href="#icon-help"></use></svg>
              <span id="hint-btn-label">${
                isStage1
                  ? (activeHintWindowSec > 0 ? `Chart open (${formatMmSs(activeHintWindowSec)})` : `Hint (+${content.nextCostMinutes || 3} min)`)
                  : (prog.hintsUsed === 0 ? 'Hint 1 of 2 (+3 min)' : (prog.hintsUsed === 1 ? 'Hint 2 of 2 (+5 min)' : 'No hints left'))
              }</span>
            </button>
          `}
        </div>
      </div>

      ${isStage1 ? '' : `
        <!-- Stage Active Hints Container -->
        <div id="stage-active-hint-container" class="stage-hint-container" style="display: ${content.hints && content.hints.length > 0 ? 'flex' : 'none'};">
          ${(content.hints || []).map((h, i) => {
            const costMin = i === 0 ? 3 : 5;
            const hintText = typeof h === 'object' ? (h.text || h.hint || '') : h;
            return `
              <div class="stage-hint-box" data-hint-index="${i + 1}">
                <div class="hint-header">
                  <svg class="ui-icon" width="14" height="14"><use href="#icon-help"></use></svg>
                  <span class="hint-badge-label">Hint ${i + 1} used (+${costMin} min)</span>
                </div>
                <p class="hint-text">${esc(hintText)}</p>
              </div>
            `;
          }).join('')}
        </div>
      `}

      <!-- Stage Specific Interactive Section -->
      ${specificHtml}

      <!-- Submission Form (Omitted during Stage 1 Phase 1) -->
      ${isPhase1 ? '' : `
        <form id="stage-submit-form" class="stage-submit-form">
          <div class="form-group">
            <label for="stage-answer-input" class="submit-label">Submit Verification Solution *</label>
            <div class="submit-input-group">
              <input type="text" id="stage-answer-input" class="input-control submit-input tabular-nums" placeholder="${esc(placeholderText)}" required />
              <button type="submit" id="btn-submit-answer" class="btn btn-primary btn-submit-action">Submit</button>
            </div>
          </div>
          <div id="submit-feedback" class="feedback-line"></div>
        </form>
      `}
    </div>
  `;

  attachStageInteractions(stage, content, controller, isPhase1);
}

// In-place patcher: updates stage 5 counters, pause banners, countdowns without touching inputs or focus
function patchStageInPlace(state) {
  const team = state.team;
  const content = state.stageContent || {};
  const prog = state.currentProg || { wrongAttempts: 0, hintsUsed: 0 };

  // Stage 1 Phase Transition Check
  if (team.stage === 1) {
    const isMemorise = content.phase === 'memorise' || (content.lockRemainingMs || 0) > 0;
    const currentMemoriseEl = document.getElementById('phase1-countdown');
    if ((isMemorise && !currentMemoriseEl) || (!isMemorise && currentMemoriseEl)) {
      activeRenderedStage = null;
      renderStageScreen(document.getElementById('app-main'), state, window.controllerRef || { renderApp: () => window.location.reload() });
      return;
    }
  }

  // Update hint button label
  const hintBtn = document.getElementById('btn-request-hint');
  if (hintBtn) {
    const isStage1 = team.stage === 1;
    const span = hintBtn.querySelector('span');
    if (isStage1) {
      const nextCost = content.nextCostMinutes || 3;
      if (span && !hintBtn.disabled) {
        span.textContent = `Hint (+${nextCost} min)`;
      }
    } else {
      const hintsUsed = prog.hintsUsed || 0;
      if (span) {
        span.textContent = hintsUsed === 0
          ? 'Hint 1 of 2 (+3 min)'
          : (hintsUsed === 1 ? 'Hint 2 of 2 (+5 min)' : 'No hints left');
      }
      if (hintsUsed >= 2) {
        hintBtn.disabled = true;
      }
    }
  }

  // Update in-card hints container if content.hints has items
  const hintContainer = document.getElementById('stage-active-hint-container');
  if (hintContainer && Array.isArray(content.hints) && content.hints.length > 0) {
    hintContainer.style.display = 'flex';
    hintContainer.innerHTML = content.hints.map((h, i) => {
      const costMin = i === 0 ? 3 : 5;
      const hintText = typeof h === 'object' ? (h.text || h.hint || '') : h;
      return `
        <div class="stage-hint-box" data-hint-index="${i + 1}">
          <div class="hint-header">
            <svg class="ui-icon" width="14" height="14"><use href="#icon-help"></use></svg>
            <span class="hint-badge-label">Hint ${i + 1} used (+${costMin} min)</span>
          </div>
          <p class="hint-text">${esc(hintText)}</p>
        </div>
      `;
    }).join('');
  }

  // Stage 2 external sync
  if (team.stage === 2 && content.workbench && typeof window.syncStage2FromExternal === 'function') {
    window.syncStage2FromExternal(content.workbench);
  }

  // Stage 5 device count
  if (team.stage === 5) {
    const joinedEl = document.getElementById('stage5-joined-count');
    if (joinedEl) {
      const total = content.totalMembers || (state.team ? state.team.memberCount : (state.members ? state.members.length : 3));
      joinedEl.textContent = `${content.joinedCount || 0} / ${total}`;
    }
  }

  // Stage 4 comment token
  if (team.stage === 4) {
    const anchor = document.getElementById('stage-4-secret-anchor');
    if (anchor && content.commentToken && !anchor.innerHTML) {
      anchor.innerHTML = content.commentToken;
    }
  }
}

function attachStageInteractions(stage, content, controller, isPhase1) {
  window.controllerRef = controller;

  // Handle Stage 1 Phase 1 (MEMORISE) 300-Second Ticker
  if (stage === 1 && isPhase1) {
    const countdownEl = document.getElementById('phase1-countdown');
    const fillEl = document.getElementById('phase1-progress-bar-fill');
    const totalSec = content.memoriseSeconds || 300;
    const opensAt = content.stage1OpensAt || content.opensAt || (Date.now() + (content.lockRemainingMs || (totalSec * 1000)));

    const formatMmSs = (s) => {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    if (stage1LockTimer) clearInterval(stage1LockTimer);
    stage1LockTimer = setInterval(() => {
      const now = Date.now();
      const msLeft = Math.max(0, opensAt - now);
      const sec = Math.ceil(msLeft / 1000);
      if (countdownEl) countdownEl.textContent = `${formatMmSs(sec)} (${sec}s)`;
      if (fillEl) {
        const pct = Math.min(100, Math.max(0, Math.round((sec / totalSec) * 100)));
        fillEl.style.width = `${pct}%`;
      }
      if (msLeft <= 0) {
        clearInterval(stage1LockTimer);
        stage1LockTimer = null;
        // 150-200ms transition to Phase 2
        setTimeout(() => {
          activeRenderedStage = null;
          controller.renderApp();
        }, 180);
      }
    }, 1000);
    return;
  }

  const submitForm = document.getElementById('stage-submit-form');
  const answerInput = document.getElementById('stage-answer-input');
  const submitBtn = document.getElementById('btn-submit-answer');
  const feedbackEl = document.getElementById('submit-feedback');

  if (submitForm) {
    submitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answer = answerInput.value.trim();
      if (!answer) return;

      feedbackEl.className = 'feedback-line';
      feedbackEl.textContent = 'Verifying solution with mission central...';

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer })
        });
        const data = await res.json();

        if (res.status === 429) {
          feedbackEl.className = 'feedback-line error';
          feedbackEl.textContent = data.error || 'Rate limit active. Please wait a moment.';
          return;
        }

        if (res.status === 400 && data.lowercaseRequired) {
          feedbackEl.className = 'feedback-line warning';
          feedbackEl.textContent = data.message || 'Enter your answer in lowercase';
          return;
        }

        if (!res.ok) {
          feedbackEl.className = 'feedback-line error';
          feedbackEl.textContent = data.error || 'Submission rejected.';
          return;
        }

        if (data.success) {
          feedbackEl.className = 'feedback-line success';
          feedbackEl.textContent = 'CORRECT SOLUTION! Advancing...';
          controller.showToast('Stage Solution Verified!');
          setTimeout(() => controller.renderApp(), 800);
        } else {
          feedbackEl.className = 'feedback-line error';
          feedbackEl.textContent = `Incorrect attempt #${data.wrongAttempts}. ${data.penaltyApplied ? '(+1m penalty applied)' : ''}`;
        }
      } catch {
        feedbackEl.className = 'feedback-line error';
        feedbackEl.textContent = 'Connection failure.';
      }
    });
  }

  // Function to open docked 26-letter Morse chart for 30 seconds with countdown
  function openMorseDockedPanel(chartData = null, durationSeconds = 30) {
    let panel = document.getElementById('stage1-docked-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stage1-docked-panel';
      panel.className = 'morse-docked-panel';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Morse reference table');
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="morse-docked-header">
        <div class="morse-docked-title">
          <svg class="ui-icon" width="18" height="18"><use href="#icon-signal"></use></svg>
          <span>Morse Reference Table (Active Hint)</span>
        </div>
        <div class="morse-docked-actions">
          <span id="docked-timer-countdown" class="morse-docked-timer tabular-nums">${durationSeconds}s</span>
          <button type="button" id="btn-close-docked" class="btn-close-docked" aria-label="Close Morse reference panel">&times;</button>
        </div>
      </div>
      <div class="phase1-progress-bar-track" style="margin-bottom: 12px; height: 4px;">
        <div id="docked-progress-bar-fill" class="phase1-progress-bar-fill" style="width: 100%; background: var(--accent-warning);"></div>
      </div>
      ${renderMorseTableHtml(chartData || content.morseChart || content.chart)}
    `;

    panel.style.display = 'block';

    const closeBtn = panel.querySelector('#btn-close-docked');
    closeBtn?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    const timerEl = panel.querySelector('#docked-timer-countdown');
    const fillEl = panel.querySelector('#docked-progress-bar-fill');
    const hintBtn = document.getElementById('btn-request-hint');
    const hintLabel = document.getElementById('hint-btn-label');

    if (morseChartTimer) clearInterval(morseChartTimer);
    let secondsLeft = durationSeconds;

    const formatMmSs = (s) => {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    if (hintBtn) hintBtn.disabled = true;
    if (hintLabel) hintLabel.textContent = `Chart open (${formatMmSs(secondsLeft)})`;

    morseChartTimer = setInterval(() => {
      secondsLeft--;
      if (timerEl) timerEl.textContent = `${secondsLeft}s`;
      if (fillEl) {
        const pct = Math.max(0, Math.round((secondsLeft / durationSeconds) * 100));
        fillEl.style.width = `${pct}%`;
      }
      if (hintLabel) hintLabel.textContent = `Chart open (${formatMmSs(secondsLeft)})`;

      if (secondsLeft <= 0) {
        clearInterval(morseChartTimer);
        morseChartTimer = null;
        if (panel && panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
        if (hintBtn) hintBtn.disabled = false;
        if (hintLabel) hintLabel.textContent = 'Hint (+5 min)';
        if (window.controllerRef && window.controllerRef.renderApp) {
          window.controllerRef.renderApp();
        }
      }
    }, 1000);
  }

  // If server indicated chart is visible with countdown, start timer
  if (stage === 1 && content.chartVisibleUntil && content.chartVisibleUntil > Date.now()) {
    const sec = Math.ceil((content.chartVisibleUntil - Date.now()) / 1000);
    openMorseDockedPanel(content.morseChart || content.chart, sec);
  }

  // Hint button with dynamic confirmation and in-card hint rendering
  const hintBtn = document.getElementById('btn-request-hint');
  if (hintBtn) {
    hintBtn.addEventListener('click', async () => {
      const isStage1 = stage === 1;
      const prog = (window.controllerRef && window.controllerRef.state && window.controllerRef.state.currentProg) || { hintsUsed: 0 };
      const nextHintNum = (prog.hintsUsed || 0) + 1;
      const nextCost = isStage1 ? (content.nextCostMinutes || (prog.hintsUsed === 0 ? 3 : 5)) : (nextHintNum === 1 ? 3 : 5);

      // In Stage 1, if timer is still running and panel was hidden by close button, re-show it for free
      const dockedPanel = document.getElementById('stage1-docked-panel');
      if (isStage1 && morseChartTimer && dockedPanel) {
        dockedPanel.style.display = 'block';
        return;
      }

      const confirmPrompt = isStage1
        ? `Unlocking this hint will add ${nextCost} penalty minutes to your team score and reveal the Morse chart for 30 seconds. Proceed?`
        : `Unlocking Hint ${nextHintNum} of 2 will add ${nextCost} penalty minutes to your team score. Proceed?`;

      if (!confirm(confirmPrompt)) return;

      const idempKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `hint_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      hintBtn.disabled = true;
      const hintLabel = document.getElementById('hint-btn-label');
      if (hintLabel) hintLabel.textContent = 'Unlocking...';

      try {
        const res = await fetch('/api/hint', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempKey
          }
        });

        if (res.status === 429) {
          alert('Please wait 2 seconds between hint requests.');
          hintBtn.disabled = false;
          if (hintLabel) hintLabel.textContent = isStage1 ? `Hint (+${nextCost} min)` : (prog.hintsUsed === 0 ? 'Hint 1 of 2 (+3 min)' : 'Hint 2 of 2 (+5 min)');
          return;
        }

        const data = await res.json();
        if (res.ok && data.success) {
          const hintText = data.text || data.hint;
          if (data.costMinutes > 0 || data.cost > 0) {
            controller.showToast(`Hint unlocked (+${data.costMinutes || data.cost}m)`);
          }

          if (isStage1) {
            const chartData = data.morseChart || data.chart || content.morseChart || content.chart;
            openMorseDockedPanel(chartData, data.displayDurationSeconds || 30);
          } else {
            const hintContainer = document.getElementById('stage-active-hint-container');
            if (hintContainer) {
              hintContainer.style.display = 'flex';
              const newBox = document.createElement('div');
              newBox.className = 'stage-hint-box';
              newBox.innerHTML = `
                <div class="hint-header">
                  <svg class="ui-icon" width="14" height="14"><use href="#icon-help"></use></svg>
                  <span>Hint ${data.hintsUsed || nextHintNum} (+${data.costMinutes || nextCost}m)</span>
                </div>
                <p class="hint-text">${esc(hintText)}</p>
              `;
              hintContainer.appendChild(newBox);
            }
            controller.renderApp();
          }
        } else {
          alert(data.error || 'Hint unavailable.');
          hintBtn.disabled = false;
          if (hintLabel) hintLabel.textContent = isStage1 ? `Hint (+${nextCost} min)` : (prog.hintsUsed === 0 ? 'Hint 1 of 2 (+3 min)' : 'Hint 2 of 2 (+5 min)');
        }
      } catch (fetchErr) {
        console.error('[HINT FETCH ERROR]', fetchErr);
        alert('Network error requesting hint.');
        hintBtn.disabled = false;
        if (hintLabel) hintLabel.textContent = isStage1 ? `Hint (+${nextCost} min)` : (prog.hintsUsed === 0 ? 'Hint 1 of 2 (+3 min)' : 'Hint 2 of 2 (+5 min)');
      }
    });
  }

  // Stage 1: Optical Beacon Strobe, Assembled Slots Sync, & Chart Click-to-Insert
  if (stage === 1) {
    const strobeBtn = document.getElementById('btn-trigger-strobe');
    const lamp = document.getElementById('optical-beacon-lamp');
    const lampStatus = document.getElementById('optical-beacon-status');
    const slowCheck = document.getElementById('beacon-slow-check');

    if (strobeBtn && lamp) {
      let strobeRunning = false;
      strobeBtn.addEventListener('click', () => {
        if (strobeRunning) return;
        strobeRunning = true;
        strobeBtn.disabled = true;
        if (lampStatus) lampStatus.textContent = 'FLASHING...';
        const lampEnded = document.getElementById('optical-beacon-ended');
        if (lampEnded) {
          lampEnded.style.display = 'none';
          lampEnded.classList.remove('visible');
        }

        const isSlow = slowCheck && slowCheck.checked;
        const s3 = content?.sectors?.find(s => s.id === 3);
        const baseUnit = s3?.unitMs || 600;
        const unitMs = isSlow ? Math.round(baseUnit * 1.5) : baseUnit;
        const leadInMs = s3?.leadInMs || 800;

        const serverPulses = s3?.pulses;
        const pulses = (serverPulses && Array.isArray(serverPulses))
          ? serverPulses.map(p => ({
            on: isSlow ? Math.round(p.on * 1.5) : p.on,
            off: isSlow ? Math.round(p.off * 1.5) : p.off
          }))
          : [
            { on: unitMs, off: unitMs },
            { on: unitMs, off: unitMs },
            { on: unitMs, off: unitMs },
            { on: unitMs * 3, off: unitMs }
          ];

        let pIdx = 0;
        let expectedNextTime = performance.now() + leadInMs;

        function runPulse() {
          if (pIdx >= pulses.length) {
            lamp.className = 'beacon-lamp';
            if (lampStatus) lampStatus.textContent = 'DONE';
            const lampEnded = document.getElementById('optical-beacon-ended');
            if (lampEnded) {
              lampEnded.style.display = 'inline-flex';
              lampEnded.classList.add('visible');
              lampEnded.textContent = 'DONE';
            }
            strobeBtn.disabled = false;
            strobeRunning = false;
            return;
          }
          const p = pulses[pIdx++];
          lamp.className = 'beacon-lamp active lamp-on';

          expectedNextTime += p.on;
          const onDelay = Math.max(0, expectedNextTime - performance.now());
          setTimeout(() => {
            lamp.className = 'beacon-lamp';
            expectedNextTime += p.off;
            const offDelay = Math.max(0, expectedNextTime - performance.now());
            setTimeout(runPulse, offDelay);
          }, onDelay);
        }

        setTimeout(runPulse, leadInMs);
      });
    }

    // Connect Morse chart cards: click to insert character
    document.querySelectorAll('.morse-ref-card').forEach(card => {
      card.addEventListener('click', () => {
        const letter = card.getAttribute('data-letter');
        if (answerInput && letter) {
          if (answerInput.value.length < 4) {
            answerInput.value = (answerInput.value + letter).toUpperCase();
          } else {
            answerInput.value = letter;
          }
          answerInput.dispatchEvent(new Event('input'));
          answerInput.focus();
        }
      });
    });

    // Wire 4 single-letter input boxes (Letter 1 to 4)
    const letterInputs = [
      document.getElementById('letter-0'),
      document.getElementById('letter-1'),
      document.getElementById('letter-2'),
      document.getElementById('letter-3')
    ];

    function syncLetterBoxesToMain() {
      const combined = letterInputs.map(inp => inp ? inp.value.trim().toUpperCase() : '').join('');
      if (answerInput) {
        answerInput.value = combined;
        answerInput.dispatchEvent(new Event('input'));
      }
    }

    function syncMainToLetterBoxes() {
      if (!answerInput) return;
      const val = answerInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      letterInputs.forEach((inp, idx) => {
        if (inp) {
          const ch = val[idx] || '';
          if (inp.value !== ch) {
            inp.value = ch;
          }
          if (ch) {
            inp.classList.add('filled');
          } else {
            inp.classList.remove('filled');
          }
        }
      });
    }

    letterInputs.forEach((inp, idx) => {
      if (!inp) return;
      inp.addEventListener('input', () => {
        const val = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        inp.value = val ? val[val.length - 1] : '';
        if (inp.value) {
          inp.classList.add('filled');
          if (idx < 3 && letterInputs[idx + 1]) {
            letterInputs[idx + 1].focus();
            letterInputs[idx + 1].select();
          }
        } else {
          inp.classList.remove('filled');
        }
        syncLetterBoxesToMain();
      });

      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          letterInputs[idx - 1].focus();
          letterInputs[idx - 1].select();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          syncLetterBoxesToMain();
          if (submitForm) {
            submitForm.dispatchEvent(new Event('submit', { cancelable: true }));
          }
        }
      });

      inp.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        clean.split('').forEach((ch, i) => {
          if (letterInputs[i]) {
            letterInputs[i].value = ch;
            letterInputs[i].classList.add('filled');
          }
        });
        syncLetterBoxesToMain();
        if (clean.length === 4 && submitBtn) {
          submitBtn.focus();
        } else if (letterInputs[clean.length]) {
          letterInputs[clean.length].focus();
        }
      });
    });

    // Connect answer input to 4-slot visual assembled preview
    if (answerInput) {
      function updateSlots() {
        const val = answerInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (let i = 1; i <= 4; i++) {
          const slotEl = document.getElementById(`slot-val-${i}`);
          const boxEl = document.getElementById(`slot-preview-${i}`);
          if (slotEl && boxEl) {
            const char = val[i - 1] || '?';
            slotEl.textContent = char;
            if (val[i - 1]) {
              boxEl.classList.add('active-slot');
            } else {
              boxEl.classList.remove('active-slot');
            }
          }
        }
        syncMainToLetterBoxes();
      }
      answerInput.addEventListener('input', updateSlots);
      updateSlots();
    }
  }

  // Stage 2: Cryptanalyst Workbench State & Operations
  if (stage === 2) {
    const rawCipher = (content.encodedText || content.payload || '').trim();
    const tkInput = document.getElementById('toolkit-input');
    const tkOutput = document.getElementById('toolkit-output');
    const tkErr = document.getElementById('toolkit-error');
    const seqChips = document.getElementById('toolkit-sequence-chips');
    const vigenereInput = document.getElementById('vigenere-key-input');
    const decoders = window.stage2Decoders || {};

    const modules = content.modules || [
      { id: 'rot13', index: 1, label: 'ROT13' },
      { id: 'base64', index: 2, label: 'Base64' },
      { id: 'hex', index: 3, label: 'Hex' },
      { id: 'atbash', index: 4, label: 'Atbash' },
      { id: 'reverse', index: 5, label: 'Reverse' },
      { id: 'caesar', index: 6, label: 'Caesar (shift 3)' }
    ];

    let wbState = {
      payloadLoaded: !!(content.workbench && content.workbench.payloadLoaded),
      steps: Array.isArray(content.workbench && content.workbench.steps) ? [...content.workbench.steps] : [],
      version: (content.workbench && content.workbench.version) || 0
    };

    function applyModuleTransform(text, idx) {
      if (!decoders) return { ok: false, reason: 'Decoders library unavailable' };
      switch (idx) {
        case 1: return decoders.rot13(text);
        case 2: return decoders.base64Decode(text);
        case 3: return decoders.hexDecode(text);
        case 4: return decoders.atbash(text);
        case 5: return decoders.reverse(text);
        case 6: return decoders.caesar(text, 3);
        default: return { ok: false, reason: `Unknown module ${idx}` };
      }
    }

    function recomputeWorkbenchUI() {
      if (tkErr) tkErr.textContent = '';

      // Reset all module buttons to initial state
      for (const m of modules) {
        const btn = document.getElementById(`btn-module-${m.index}`);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('used');
          btn.innerHTML = `
            <span class="stage2-decoder-badge">${m.index}</span>
            <span class="module-label">${esc(m.label)}</span>
          `;
        }
      }

      if (!wbState.payloadLoaded) {
        if (tkInput) tkInput.value = '';
        if (tkOutput) tkOutput.textContent = '(Results will appear here)';
        if (seqChips) seqChips.innerHTML = '<span class="seq-empty" style="color: var(--text-muted); font-size: 0.8rem;">(None applied)</span>';
        return;
      }

      if (tkInput) tkInput.value = rawCipher;

      let currentText = rawCipher;
      const appliedChips = [];

      for (const step of wbState.steps) {
        if (step.t === 'm') {
          const mod = modules.find(m => m.index === step.i) || { label: `Mod ${step.i}`, index: step.i };
          const res = applyModuleTransform(currentText, step.i);
          if (res && res.ok) {
            currentText = res.text;
          }
          const btn = document.getElementById(`btn-module-${step.i}`);
          if (btn) {
            btn.disabled = true;
            btn.classList.add('used');
            btn.innerHTML = `
              <span class="stage2-decoder-badge">${step.i}</span>
              <span class="module-label">${esc(mod.label)}</span>
              <svg class="ui-icon" width="14" height="14"><use href="#icon-check"></use></svg>
            `;
          }
          appliedChips.push(`<span class="stage2-seq-chip">[${step.i}] ${esc(mod.label)}</span>`);
        } else if (step.t === 'v') {
          if (decoders.vigenereNumericDecode) {
            const res = decoders.vigenereNumericDecode(currentText, step.k);
            if (res && res.ok) {
              currentText = res.text;
            }
          }
          appliedChips.push(`<span class="stage2-seq-chip">[Key: ${esc(step.k)}]</span>`);
        }
      }

      if (tkOutput) {
        tkOutput.textContent = wbState.steps.length > 0 ? currentText : '(Results will appear here)';
      }

      if (seqChips) {
        seqChips.innerHTML = appliedChips.length > 0
          ? appliedChips.join('')
          : '<span class="seq-empty" style="color: var(--text-muted); font-size: 0.8rem;">(None applied)</span>';
      }
    }

    async function syncWorkbenchServer(action, payload = {}) {
      const prev = { ...wbState, steps: [...wbState.steps] };
      try {
        const res = await fetch('/api/stage2/workbench', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            expectedVersion: wbState.version,
            ...payload
          })
        });
        const data = await res.json();
        if (res.status === 409) {
          // Version conflict: rollback and reload fresh state
          if (data.state) {
            wbState.payloadLoaded = data.state.payloadLoaded;
            wbState.steps = data.state.steps || [];
            wbState.version = data.state.version;
            recomputeWorkbenchUI();
            if (tkErr) tkErr.textContent = 'Synchronized with external update.';
          }
          return;
        }
        if (!res.ok) {
          wbState = prev;
          recomputeWorkbenchUI();
          if (tkErr) tkErr.textContent = data.error || 'Server rejected workbench change.';
          return;
        }
        if (data.ok && data.state) {
          wbState.payloadLoaded = data.state.payloadLoaded;
          wbState.steps = data.state.steps || [];
          wbState.version = data.state.version;
          recomputeWorkbenchUI();
        }
      } catch {
        wbState = prev;
        recomputeWorkbenchUI();
        if (tkErr) tkErr.textContent = 'Network error synchronizing workbench.';
      }
    }

    // Expose external sync for patchStageInPlace
    window.syncStage2FromExternal = (freshWb) => {
      if (freshWb && freshWb.version !== wbState.version) {
        wbState.payloadLoaded = freshWb.payloadLoaded;
        wbState.steps = freshWb.steps || [];
        wbState.version = freshWb.version;
        recomputeWorkbenchUI();
      }
    };

    // Paste payload
    document.getElementById('btn-paste-original')?.addEventListener('click', () => {
      if (!rawCipher) {
        if (tkErr) tkErr.textContent = 'No cryptographic payload received from server.';
        return;
      }
      wbState.payloadLoaded = true;
      recomputeWorkbenchUI();
      syncWorkbenchServer('load');
    });

    // Copy payload
    document.getElementById('btn-copy-payload')?.addEventListener('click', async () => {
      if (rawCipher) {
        try {
          await navigator.clipboard.writeText(rawCipher);
          controller.showToast('Payload copied to clipboard');
        } catch {
          const ta = document.createElement('textarea');
          ta.value = rawCipher;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          controller.showToast('Payload copied to clipboard');
        }
      }
    });

    // Copy output
    document.getElementById('btn-copy-output')?.addEventListener('click', async () => {
      if (tkOutput && tkOutput.textContent && tkOutput.textContent !== '(Results will appear here)') {
        try {
          await navigator.clipboard.writeText(tkOutput.textContent);
          controller.showToast('Transformed output copied to clipboard');
        } catch {
          const ta = document.createElement('textarea');
          ta.value = tkOutput.textContent;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          controller.showToast('Transformed output copied to clipboard');
        }
      }
    });

    // Undo
    document.getElementById('btn-undo-step')?.addEventListener('click', () => {
      if (wbState.steps.length === 0) return;
      wbState.steps.pop();
      recomputeWorkbenchUI();
      syncWorkbenchServer('undo');
    });

    // Reset
    document.getElementById('btn-reset-workbench')?.addEventListener('click', () => {
      wbState.steps = [];
      recomputeWorkbenchUI();
      syncWorkbenchServer('reset');
    });

    // Decoder module buttons (1..6)
    for (const m of modules) {
      document.getElementById(`btn-module-${m.index}`)?.addEventListener('click', () => {
        if (!wbState.payloadLoaded) {
          if (tkErr) tkErr.textContent = 'Click "Paste payload" to begin cryptanalysis.';
          return;
        }
        if (wbState.steps.some(s => s.t === 'm' && s.i === m.index)) {
          return;
        }
        const currentText = (tkOutput && tkOutput.textContent && tkOutput.textContent !== '(Results will appear here)')
          ? tkOutput.textContent
          : rawCipher;
        const res = applyModuleTransform(currentText, m.index);
        if (!res || !res.ok) {
          if (tkErr) tkErr.textContent = res ? res.reason : 'Transformation failed';
          return;
        }
        wbState.steps.push({ t: 'm', i: m.index });
        recomputeWorkbenchUI();
        syncWorkbenchServer('apply', { moduleIndex: m.index });
      });
    }

    // Vigenère decode
    document.getElementById('btn-vigenere-apply')?.addEventListener('click', () => {
      if (!wbState.payloadLoaded) {
        if (tkErr) tkErr.textContent = 'Click "Paste payload" to begin cryptanalysis.';
        return;
      }
      const rawKey = vigenereInput ? vigenereInput.value.trim() : '';
      if (!decoders.validateNumericVigenereKey) {
        if (tkErr) tkErr.textContent = 'Decoders library unavailable.';
        return;
      }
      const val = decoders.validateNumericVigenereKey(rawKey);
      if (!val.ok) {
        if (tkErr) tkErr.textContent = val.reason;
        return;
      }
      const currentText = (tkOutput && tkOutput.textContent && tkOutput.textContent !== '(Results will appear here)')
        ? tkOutput.textContent
        : rawCipher;
      const res = decoders.vigenereNumericDecode(currentText, val.key);
      if (!res || !res.ok) {
        if (tkErr) tkErr.textContent = res ? res.reason : 'Vigenère decode failed';
        return;
      }
      wbState.steps.push({ t: 'v', k: val.key });
      if (vigenereInput) vigenereInput.value = '';
      recomputeWorkbenchUI();
      syncWorkbenchServer('vigenere', { key: val.key });
    });

    // Initial render
    recomputeWorkbenchUI();
  }

  // Stage 3: WARDEN Chat
  if (stage === 3) {
    const chatWin = document.getElementById('chat-window');
    const msgInput = document.getElementById('warden-msg-input');
    const sendBtn = document.getElementById('btn-send-warden');

    async function sendMsg() {
      const msg = msgInput.value.trim();
      if (!msg) return;

      const userBubble = document.createElement('div');
      userBubble.className = 'chat-bubble user';
      userBubble.textContent = msg;
      chatWin.appendChild(userBubble);
      chatWin.scrollTop = chatWin.scrollHeight;

      msgInput.value = '';
      sendBtn.disabled = true;

      try {
        const res = await fetch('/api/warden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        const wardenBubble = document.createElement('div');
        wardenBubble.className = 'chat-bubble warden';
        wardenBubble.textContent = data.reply || data.error || 'No response from WARDEN.';
        chatWin.appendChild(wardenBubble);
        chatWin.scrollTop = chatWin.scrollHeight;
      } catch {
        const errBubble = document.createElement('div');
        errBubble.className = 'chat-bubble system';
        errBubble.textContent = 'Communication link lost.';
        chatWin.appendChild(errBubble);
      } finally {
        sendBtn.disabled = false;
      }
    }

    sendBtn?.addEventListener('click', sendMsg);
    msgInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMsg();
      }
    });
  }

  // Stage 4: Cyber Terminal with History & Clear
  if (stage === 4) {
    const anchor = document.getElementById('stage-4-secret-anchor');
    if (anchor && content && content.commentToken) {
      anchor.innerHTML = content.commentToken;
    }

    const termInput = document.getElementById('terminal-cmd-input');
    const termHistory = document.getElementById('terminal-history');

    termInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (terminalCmdHistory.length > 0) {
          if (terminalHistoryIndex === -1) terminalHistoryIndex = terminalCmdHistory.length - 1;
          else if (terminalHistoryIndex > 0) terminalHistoryIndex--;
          termInput.value = terminalCmdHistory[terminalHistoryIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (terminalHistoryIndex !== -1) {
          if (terminalHistoryIndex < terminalCmdHistory.length - 1) {
            terminalHistoryIndex++;
            termInput.value = terminalCmdHistory[terminalHistoryIndex];
          } else {
            terminalHistoryIndex = -1;
            termInput.value = '';
          }
        }
      } else if (e.key === 'Enter') {
        const cmd = termInput.value.trim();
        termInput.value = '';
        terminalHistoryIndex = -1;
        if (!cmd) return;

        terminalCmdHistory.push(cmd);
        if (terminalCmdHistory.length > 50) terminalCmdHistory.shift();

        if (cmd.toLowerCase() === 'clear') {
          termHistory.textContent = '';
          return;
        }

        termHistory.textContent += `$ ${cmd}\n`;

        try {
          const res = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd })
          });
          const data = await res.json();
          if (data.clear) {
            termHistory.textContent = '';
          } else {
            termHistory.textContent += `${data.output || data.error || ''}\n\n`;
            termHistory.scrollTop = termHistory.scrollHeight;
          }
        } catch {
          termHistory.textContent += `Error executing command.\n\n`;
        }
      }
    });
  }
}

export function renderResultScreen(container, state, controller) {
  const team = state.team;
  const members = (state.members || []).map(m => m.fullName).join(', ');
  const elapsedMs = team.finishedAt - team.startedAt - (team.pausedMs || 0);
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000) + team.penaltyMin * 60);

  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const formattedTotal = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const vCode = state.verificationCode || 'UNKNOWN';
  const copyString = `Final Override | ${team.name} | ${formattedTotal} | code ${vCode}`;

  container.innerHTML = `
    <div class="card result-container page-enter" style="text-align: center; padding: 36px 20px;">
      <h1 class="result-title">SYSTEM OVERRIDE SUCCESSFUL</h1>
      <p style="font-size: 1.15rem; color: var(--text-primary); margin-top: 8px;">
        Team <strong>${esc(team.name)}</strong> (${esc(members)}) successfully overrode the vault lockdown.
      </p>

      <div class="result-time-hero tabular-nums">
        ${esc(formattedTotal)}
      </div>
      <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 24px;">
        Final calculated time including ${team.penaltyMin}m penalty.
      </p>

      <div class="result-code-box tabular-nums">
        VERIFICATION CODE: ${esc(vCode)}
      </div>

      <p style="max-width: 600px; margin: 0 auto 20px; color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5;">
        Present this screen with verification code to your coordinator (<strong>${esc(team.coordinator)}</strong>) or an event judge.
      </p>

      <button id="btn-copy-result" class="btn btn-primary">
        <svg class="ui-icon" width="14" height="14"><use href="#icon-copy"></use></svg>
        <span>Copy Verification String</span>
      </button>
    </div>
  `;

  document.getElementById('btn-copy-result')?.addEventListener('click', () => {
    navigator.clipboard.writeText(copyString);
    controller.showToast('Result copied to clipboard!');
  });
}
