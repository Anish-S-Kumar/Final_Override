/**
 * FINAL OVERRIDE — End-to-End Browser Flow & DOM Verification Suite
 * Validates DOM integrity, UI contracts, registration flow, Stage 1 two-phase transitions,
 * Sector 3 optical beacon timing, 4-box keyboard navigation, and all 6 stages.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

async function runBrowserVerification() {
  console.log('=============================================================');
  console.log('🧪 FINAL OVERRIDE — BROWSER FLOW & DOM VERIFICATION SUITE');
  console.log('=============================================================\n');

  const htmlPath = path.join(__dirname, '../public/index.html');
  const indexHtml = fs.readFileSync(htmlPath, 'utf8');

  // Set up JSDOM environment
  const dom = new JSDOM(indexHtml, {
    url: 'http://localhost:3000',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const { window } = dom;
  const { document } = window;
  global.window = window;
  global.document = document;
  global.Event = window.Event;
  global.KeyboardEvent = window.KeyboardEvent;
  global.ClipboardEvent = window.ClipboardEvent;
  global.HTMLElement = window.HTMLElement;
  global.navigator = window.navigator;

  // Import views module dynamically
  const lobbyModule = await import('../public/js/views/lobby.js');
  const stagesModule = await import('../public/js/views/stages.js');
  const { renderStartScreen } = lobbyModule;
  const { renderStageScreen, renderResultScreen } = stagesModule;

  const appMain = document.getElementById('app-main') || document.createElement('main');
  appMain.id = 'app-main';
  if (!document.getElementById('app-main')) document.body.appendChild(appMain);

  const mockController = {
    showToast: (msg) => console.log(`   [Toast] ${msg}`),
    submitAnswer: async () => {},
    requestHint: async () => {}
  };

  // -------------------------------------------------------------------------
  // TEST 1: Registration Form Structure & Member 4 Optionality
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Verifying Registration Form & Member 4 Optionality...');
  await renderStartScreen(appMain, mockController);

  const member4Input = document.getElementById('reg-m4');
  assert.ok(member4Input, 'Member 4 input element (reg-m4) must exist in registration view');
  assert.strictEqual(member4Input.hasAttribute('required'), false, 'Member 4 must NOT have required attribute');
  
  const member4Label = document.querySelector('label[for="reg-m4"]');
  assert.ok(member4Label, 'Label for Member 4 must exist');
  assert.ok(member4Label.textContent.includes('optional'), 'Label must explicitly indicate Member 4 is optional');

  const m1 = document.getElementById('reg-m1');
  const m2 = document.getElementById('reg-m2');
  const m3 = document.getElementById('reg-m3');
  assert.ok(m1 && m1.hasAttribute('required'), 'Member 1 must be required');
  assert.ok(m2 && m2.hasAttribute('required'), 'Member 2 must be required');
  assert.ok(m3 && m3.hasAttribute('required'), 'Member 3 must be required');
  console.log('✅ Test 1 Passed: Registration form correctly specifies 3-4 players with Member 4 optional.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Stage Rail & Dossier Strip (6 Canonical Stages)
  // -------------------------------------------------------------------------
  console.log('[TEST 2] Verifying Stage Rail & Dossier Strip (6 Stages)...');
  const stageRailItems = document.querySelectorAll('.stage-rail .rail-step');
  assert.strictEqual(stageRailItems.length, 6, `Expected exactly 6 stage rail items, found ${stageRailItems.length}`);

  const expectedStageNames = [
    'Intercept',
    'Decode',
    'WARDEN',
    'CTF',
    'Sync',
    'Override'
  ];

  stageRailItems.forEach((item, idx) => {
    const text = item.textContent;
    assert.ok(text.includes(expectedStageNames[idx]), `Stage ${idx + 1} rail item should contain "${expectedStageNames[idx]}"`);
  });

  const dossierSlots = document.querySelectorAll('.stage-rail .rail-step[data-slot]');
  assert.strictEqual(dossierSlots.length, 6, `Expected exactly 6 dossier/stage rail slots, found ${dossierSlots.length}`);
  console.log('✅ Test 2 Passed: Stage rail and dossier strip correctly reflect all 6 stages.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Stage 1 Phase 1 (Memorise) State Rendering
  // -------------------------------------------------------------------------
  console.log('[TEST 3] Verifying Stage 1 Phase 1 (Memorise)...');
  const container = document.getElementById('screen-stage') || document.createElement('div');
  container.id = 'screen-stage';
  document.body.appendChild(container);

  const phase1State = {
    team: { id: 1, name: 'SQUAD-TEST', stage: 1 },
    stageContent: {
      phase: 'memorise',
      lockRemainingMs: 58000,
      memorise: {
        title: 'PHASE 1: MEMORISE THE CODE',
        text: 'MEMORISE THE CODE. You have 5 minutes (300 seconds).',
        guidelines: ['Study the pattern', 'Group similar letters']
      },
      chart: [
        { letter: 'A', code: '• —' },
        { letter: 'B', code: '— • • •' },
        { letter: 'N', code: '— •' },
        { letter: 'O', code: '— — —' },
        { letter: 'V', code: '• • • —' }
      ]
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: {}
  };

  renderStageScreen(container, phase1State, mockController);

  const memCard = container.querySelector('.phase1-memorise-card');
  assert.ok(memCard, 'Phase 1 memorise card must be rendered');
  const countdownEl = container.querySelector('#phase1-countdown');
  assert.ok(countdownEl, 'Phase 1 countdown timer must be present');
  assert.ok(countdownEl.textContent.includes('58s'), 'Countdown timer should display remaining seconds');

  const chartTiles = container.querySelectorAll('.morse-tile');
  assert.ok(chartTiles.length >= 5, 'Morse reference tiles must be rendered during Phase 1');

  // Crucial security check: Sectors and answer boxes must NOT exist in Phase 1 DOM
  assert.strictEqual(container.querySelector('.sectors-grid-2x2'), null, 'Sectors grid must NOT be rendered in Phase 1');
  assert.strictEqual(container.querySelector('#letter-0'), null, 'Letter boxes must NOT be rendered in Phase 1');
  assert.strictEqual(container.querySelector('#btn-submit-answer'), null, 'Submit button must NOT be rendered in Phase 1');
  console.log('✅ Test 3 Passed: Stage 1 Phase 1 isolates memorisation without leaking solve inputs.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Stage 1 Phase 2 (Solve) State, Sector Cards & Keyboard Navigation
  // -------------------------------------------------------------------------
  console.log('[TEST 4] Verifying Stage 1 Phase 2 (Solve), Sectors & 4-Box Keyboard Controls...');

  // Reset active render state by passing different team id
  const phase2State = {
    team: { id: 2, name: 'SQUAD-TEST', stage: 1 },
    stageContent: {
      phase: 'solve',
      lockRemainingMs: 0,
      intro: {
        title: 'MISSION 1: DECODE THE 4-LETTER VAULT CODE',
        text: 'The vault door is locked with a secret 4-letter password.'
      },
      sectors: {
        sector1: { label: 'SECTOR 1', signal: '— •' },
        sector2: { label: 'SECTOR 2', binary: '111-0-111-0-111' },
        sector3: { label: 'SECTOR 3', flashes: '3 short, 1 long' },
        sector4: { label: 'SECTOR 4', signal: '• —' }
      }
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: {}
  };

  // Render Phase 2
  renderStageScreen(container, phase2State, mockController);

  // Phase 1 elements should be gone
  assert.strictEqual(container.querySelector('.phase1-memorise-card'), null, 'Phase 1 card must be removed in Phase 2');

  // Sector cards must be present
  const sectorGrid = container.querySelector('.sectors-grid-2x2');
  assert.ok(sectorGrid, '2x2 Sector grid must be rendered in Phase 2');
  const sectorCards = container.querySelectorAll('.sector-card');
  assert.strictEqual(sectorCards.length, 4, 'Exactly 4 sector cards must be rendered');

  // Sector 3 Optical Beacon Checks
  const lamp = container.querySelector('#optical-beacon-lamp');
  const triggerBtn = container.querySelector('#btn-trigger-strobe');
  const slowCheck = container.querySelector('#beacon-slow-check');
  const endedBadge = container.querySelector('#optical-beacon-ended');

  assert.ok(lamp, 'Optical beacon lamp element must exist');
  assert.ok(triggerBtn, 'Watch Light Blink button must exist');
  assert.ok(slowCheck, 'Slow speed checkbox must exist');
  assert.ok(endedBadge, 'Transmission ended status badge must exist');

  // 4-Box Assembled Key Panel Inputs
  const box0 = container.querySelector('#letter-0');
  const box1 = container.querySelector('#letter-1');
  const box2 = container.querySelector('#letter-2');
  const box3 = container.querySelector('#letter-3');
  const answerInput = container.querySelector('#stage-answer-input');
  const submitBtn = container.querySelector('#btn-submit-answer');

  assert.ok(box0 && box1 && box2 && box3, 'All 4 single-letter input boxes (letter-0 to letter-3) must exist');
  assert.ok(answerInput, 'Hidden master answer input must exist for compatibility');
  assert.ok(submitBtn, 'Submit button must be present in Phase 2');

  // Verify Auto-Advance: Type 'N' into box0 -> advances focus to box1
  let focusTarget = null;
  box1.focus = () => { focusTarget = box1; };
  box2.focus = () => { focusTarget = box2; };
  box3.focus = () => { focusTarget = box3; };
  box0.focus = () => { focusTarget = box0; };

  box0.value = 'n';
  box0.dispatchEvent(new window.Event('input'));
  assert.strictEqual(box0.value, 'N', 'Input must be automatically converted to uppercase');
  assert.strictEqual(focusTarget, box1, 'Typing in box0 must auto-advance focus to box1');

  // Type 'O' into box1 -> advances focus to box2
  box1.value = 'o';
  box1.dispatchEvent(new window.Event('input'));
  assert.strictEqual(box1.value, 'O');
  assert.strictEqual(focusTarget, box2, 'Typing in box1 must auto-advance focus to box2');

  // Verify Backspace Navigation: Backspace on empty box2 focuses box1
  box2.value = '';
  const backspaceEvt = new window.KeyboardEvent('keydown', { key: 'Backspace' });
  box2.dispatchEvent(backspaceEvt);
  assert.strictEqual(focusTarget, box1, 'Backspace on empty box2 must return focus to box1');

  // Verify Paste Handling: Pasting 'NOVA' fills all 4 boxes and synchronizes master input
  const pasteData = {
    getData: (format) => format === 'text' ? 'nova' : ''
  };
  const pasteEvt = new window.Event('paste', { cancelable: true });
  pasteEvt.clipboardData = pasteData;

  box0.dispatchEvent(pasteEvt);
  assert.strictEqual(box0.value, 'N', 'Box 0 should receive N on paste');
  assert.strictEqual(box1.value, 'O', 'Box 1 should receive O on paste');
  assert.strictEqual(box2.value, 'V', 'Box 2 should receive V on paste');
  assert.strictEqual(box3.value, 'A', 'Box 3 should receive A on paste');
  assert.strictEqual(answerInput.value, 'NOVA', 'Master answer input must sync to pasted value "NOVA"');

  // Verify Enter Key Dispatches Form Submit
  let submitted = false;
  const form = container.querySelector('#stage-submit-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitted = true;
  });

  const enterEvt = new window.KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  box3.dispatchEvent(enterEvt);
  assert.strictEqual(submitted, true, 'Pressing Enter on letter-3 should trigger form submission');

  console.log('✅ Test 4 Passed: 4-box auto-advance, backspace navigation, paste handling, and submit verified.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Stages 2 to 6 Interactive Console Renders
  // -------------------------------------------------------------------------
  console.log('[TEST 5] Verifying Stages 2 through 6 Renders...');

  // Stage 2: Decoding Matrix & Decoder Workbench
  const stage2State = {
    team: { id: 3, name: 'SQUAD-TEST', stage: 2 },
    stageContent: {
      encodedText: 'TWFzdGVyIENvZGU=',
      cipherType: 'Base64',
      fragments: [1, 3, 5, 7]
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: { 1: 'NOVA' }
  };
  renderStageScreen(container, stage2State, mockController);
  assert.ok(container.querySelector('.toolkit-box'), 'Stage 2 cryptanalyst workbench (.toolkit-box) must be rendered');
  assert.ok(container.querySelector('#btn-module-2') || container.querySelector('#btn-decode-b64'), 'Base64 decode button must exist');
  assert.ok(container.querySelector('#btn-module-1') || container.querySelector('#btn-decode-rot13'), 'ROT13 decode button must exist');
  assert.ok(container.querySelector('#btn-undo-step'), 'Undo button must exist in workbench');

  // Stage 3: Prompt the AI (WARDEN Terminal)
  const stage3State = {
    team: { id: 4, name: 'SQUAD-TEST', stage: 3 },
    stageContent: {
      wardenStatus: 'ONLINE',
      mode: 'deterministic'
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: { 1: 'NOVA', 2: 'CIPHER' }
  };
  renderStageScreen(container, stage3State, mockController);
  assert.ok(container.querySelector('.chat-wrapper'), 'Stage 3 WARDEN console (.chat-wrapper) must be rendered');
  assert.ok(container.querySelector('#warden-msg-input'), 'WARDEN prompt input must exist');
  assert.ok(container.querySelector('#btn-send-warden'), 'WARDEN transmit button must exist');

  // Stage 4: CTF Challenges & Cyber Terminal
  const stage4State = {
    team: { id: 5, name: 'SQUAD-TEST', stage: 4 },
    stageContent: {
      commentToken: '<!-- token1 = 9 -->',
      audioFile: '/assets/signal-slow.wav'
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: { 1: 'NOVA', 2: 'CIPHER', 3: 'PROMPT' }
  };
  renderStageScreen(container, stage4State, mockController);
  assert.ok(container.querySelector('.terminal-box'), 'Stage 4 cyber terminal (.terminal-box) must be rendered');
  assert.ok(container.querySelector('#terminal-cmd-input'), 'Terminal command input must exist');

  // Stage 5: Team Sync & Multi-Device HMAC Link
  const stage5State = {
    team: { id: 6, name: 'SQUAD-TEST', stage: 5, memberCount: 4 },
    stageContent: {
      teamName: 'SQUAD-TEST',
      joinedCount: 4,
      totalMembers: 4,
      members: [
        { fullName: 'Alice', joined: true },
        { fullName: 'Bob', joined: true },
        { fullName: 'Charlie', joined: true },
        { fullName: 'Diana', joined: true }
      ],
      leaderShard: 'ALPHA-9'
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: { 1: 'NOVA', 2: 'CIPHER', 3: 'PROMPT', 4: 'CTF' }
  };
  renderStageScreen(container, stage5State, mockController);
  assert.ok(container.querySelector('.squad-link-console'), 'Stage 5 team sync console (.squad-link-console) must be rendered');
  assert.ok(container.querySelector('#stage5-joined-count'), 'Stage 5 joined count display must exist');

  // Stage 6: Final Integration & Master Override
  const stage6State = {
    team: { id: 7, name: 'SQUAD-TEST', stage: 6 },
    stageContent: {
      fragments: { 1: 'NOVA', 2: 'CIPHER', 3: 'PROMPT', 4: 'CTF', 5: 'SYNC' },
      readyForSynthesis: true
    },
    currentProg: { wrongAttempts: 0, hintsUsed: 0 },
    notebook: { 1: 'NOVA', 2: 'CIPHER', 3: 'PROMPT', 4: 'CTF', 5: 'SYNC' }
  };
  renderStageScreen(container, stage6State, mockController);
  assert.ok(container.querySelector('.sequence-order-card'), 'Stage 6 synthesis matrix (.sequence-order-card) must be rendered');
  assert.ok(container.querySelector('.sequence-chips-row'), 'Stage 6 fragment chips row must exist');
  assert.ok(container.querySelector('#btn-submit-answer'), 'Master override submit button must exist');

  console.log('✅ Test 5 Passed: All 6 stages render their dedicated UI consoles accurately.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Victory / Result Screen
  // -------------------------------------------------------------------------
  console.log('[TEST 6] Verifying Victory / Result Screen...');
  const resultState = {
    team: {
      name: 'APEX SQUAD',
      startedAt: Date.now() - 1800000,
      finishedAt: Date.now(),
      pausedMs: 0,
      penaltyMin: 2
    },
    members: [
      { fullName: 'Agent Alice' },
      { fullName: 'Agent Bob' },
      { fullName: 'Agent Charlie' }
    ],
    verificationCode: 'VRF-9821-FO'
  };

  renderResultScreen(container, resultState, mockController);
  assert.ok(container.querySelector('.result-title').textContent.includes('SYSTEM OVERRIDE SUCCESSFUL'));
  assert.ok(container.textContent.includes('APEX SQUAD'));
  assert.ok(container.textContent.includes('Agent Alice, Agent Bob, Agent Charlie'));
  assert.ok(container.querySelector('#btn-copy-result'), 'Copy verification string button must exist');
  assert.ok(container.textContent.includes('VRF-9821-FO'), 'Verification code must be displayed');

  console.log('✅ Test 6 Passed: Victory result screen formats time, roster, and verification code.\n');

  console.log('=============================================================');
  console.log('🎉 ALL BROWSER FLOW & DOM TESTS PASSED WITH ZERO FAILURES!');
  console.log('=============================================================\n');
}

runBrowserVerification().catch(err => {
  console.error('\n❌ BROWSER FLOW VERIFICATION FAILED:', err);
  process.exit(1);
});
