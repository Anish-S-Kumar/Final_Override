// FINAL OVERRIDE — Stage 1 & Hints Diagnostic Script (Task 0.2, 0.3, 0.4)
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.DB_PROVIDER = 'sqlite';
process.env.EVENT_SALT = 'diag_salt_stage1_2026';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const app = require('../server/app');
const ds = require('../server/dataService');
const { generateStage1Chart, generateStage1Sectors } = require('../server/logic/stage1Randomizer');
const mission = require('../server/content/mission.json');

async function runDiagnosis() {
  console.log('=== RUNNING STAGE 1 MORSE & HINTS DIAGNOSTIC ===\n');

  // 1. Create a test team
  const teamId = `diag_team_${Date.now()}`;
  const teamSeed = `seed_${Date.now()}`;
  const sessionToken = `diag_token_${Date.now()}`;
  const team = {
    id: teamId,
    name: 'DiagSquad_Alpha',
    seed: teamSeed,
    sessionToken: sessionToken,
    coordinator: 'Kiran',
    stage: 1,
    status: 'active',
    startedAt: Date.now() - 360000, // started 6m ago, past 300s memorise phase
    stage1EnteredAt: Date.now() - 360000,
    stage1OpensAt: Date.now() - 60000,
    memberCount: 4,
    penaltyMin: 0
  };

  await ds.createTeam({
    team,
    members: [
      { id: `${teamId}_m1`, fullName: 'Operative One', isLeader: 1 },
      { id: `${teamId}_m2`, fullName: 'Operative Two', isLeader: 0 },
      { id: `${teamId}_m3`, fullName: 'Operative Three', isLeader: 0 },
      { id: `${teamId}_m4`, fullName: 'Operative Four', isLeader: 0 }
    ],
    stageCount: 6,
    sequence: { fragmentOrder: [1, 3, 5, 7], expectedAnswer: '8m4k7r9x' }
  });

  console.log(`[SETUP] Created team: ${team.name} (Seed: ${team.seed})`);

  // 0.2 R1 Server-side Analysis
  const answerWord = 'NOVA';
  const answerLetters = answerWord.split('');
  
  // (a) Memorise-phase chart
  const memoriseChart = generateStage1Chart(team.seed);
  const memoriseMap = new Map(memoriseChart.map(c => [c.letter, c.code]));

  // (b) Hint chart
  const hintChart = generateStage1Chart(team.seed || team.id || team.name);
  const hintMap = new Map(hintChart.map(c => [c.letter, c.code]));

  // (c) Server generated sectors
  const serverSectors = generateStage1Sectors(memoriseChart, answerWord);
  
  console.log('\n--- 0.2 PATTERN COMPARISON FOR ANSWER LETTERS (NOVA) ---');
  for (let i = 0; i < answerLetters.length; i++) {
    const letter = answerLetters[i];
    const sector = serverSectors[i];
    const memPat = memoriseMap.get(letter);
    const hintPat = hintMap.get(letter);
    const sectorPat = sector.morse;
    
    console.log(`\nLetter [${letter}] (Sector ${i + 1}):`);
    console.log(`  (a) Memorise Chart Pattern : "${memPat}"`);
    console.log(`  (b) Hint Chart Pattern     : "${hintPat}" -> Match (a)? ${memPat === hintPat ? 'MATCH' : 'NO-MATCH'}`);
    console.log(`  (c) Sector Output Pattern  : "${sectorPat}" -> Match (a)? ${memPat === sectorPat ? 'MATCH' : 'NO-MATCH'}`);
    console.log(`  (d) Sector Generated Desc  : "${sector.desc}"`);
  }

  // Check duplicate patterns in table
  const codes = memoriseChart.map(c => c.code);
  const codeCounts = {};
  for (const c of codes) {
    codeCounts[c] = (codeCounts[c] || 0) + 1;
  }
  const duplicates = Object.entries(codeCounts).filter(([_, count]) => count > 1);
  console.log('\n--- TABLE DUPLICATE PATTERNS CHECK ---');
  console.log(`Total letters in chart: ${memoriseChart.length}`);
  console.log(`Unique patterns count : ${new Set(codes).size}`);
  if (duplicates.length > 0) {
    console.log('Duplicates detected:', duplicates);
  } else {
    console.log('Zero duplicate patterns found in server generation.');
  }

  // 0.3 Playwright DOM Analysis
  console.log('\n--- 0.3 PLAYWRIGHT CHROMIUM DOM INSPECTION ---');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  
  // Set session cookie
  await context.addCookies([
    {
      name: 'fo_leader_token',
      value: sessionToken,
      domain: '127.0.0.1',
      path: '/'
    }
  ]);

  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // Read Sector 1, 2, 3, 4 DOM content directly
  const sectorElements = await page.$$('.sector-card');
  console.log(`Found ${sectorElements.length} sector cards in DOM.`);

  for (let idx = 0; idx < sectorElements.length; idx++) {
    const el = sectorElements[idx];
    const header = await el.$eval('.sector-header', h => h.textContent.replace(/\s+/g, ' ').trim());
    const desc = await el.$eval('.sector-desc', d => d.textContent.replace(/\s+/g, ' ').trim());
    const chips = await el.$$eval('.pulse-chip-container .morse-chip', c => c.map(x => x.textContent.trim()));
    console.log(`\nDOM [Sector ${idx + 1}] (${header}):`);
    console.log(`  DOM Description: "${desc}"`);
    console.log(`  DOM Chips      : [${chips.join(', ')}]`);
  }

  // Check Sector 3 Strobe Lamp Sequence in DOM
  console.log('\nTesting Sector 3 Optical Beacon playback...');
  const strobeBtn = await page.$('#btn-trigger-strobe');
  const lamp = await page.$('#optical-beacon-lamp');
  const lampStatus = await page.$('#optical-beacon-status');
  const lampEnded = await page.$('#optical-beacon-ended');

  const lampTimeline = [];
  const startTime = Date.now();

  if (strobeBtn) {
    // Record class changes on lamp
    const observerHandle = await page.evaluateHandle(() => {
      window._lampEvents = [];
      const target = document.getElementById('optical-beacon-lamp');
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            window._lampEvents.push({
              time: performance.now(),
              className: target.className
            });
          }
        }
      });
      obs.observe(target, { attributes: true });
      return obs;
    });

    await strobeBtn.click();
    console.log('Clicked #btn-trigger-strobe, observing strobe playback...');
    
    // Wait for playback to finish
    await page.waitForFunction(() => {
      const status = document.getElementById('optical-beacon-status');
      return status && status.textContent === 'TRANSMISSION ENDED';
    }, { timeout: 15000 });

    const lampEvents = await page.evaluate(() => window._lampEvents);
    console.log(`Recorded ${lampEvents.length} lamp state transitions:`);
    lampEvents.forEach(e => {
      console.log(`  +${Math.round(e.time)}ms: ${e.className}`);
    });

    const endedText = await lampEnded.textContent();
    console.log(`\nDOM #optical-beacon-ended text: "${endedText}"`);
    const statusText = await lampStatus.textContent();
    console.log(`DOM #optical-beacon-status text: "${statusText}"`);
  }

  // 0.4 Check Hints DOM & DB limits
  console.log('\n--- 0.4 HINT AUDIT & LEAK CHECK ---');
  const hintBtn = await page.$('#btn-request-hint');
  if (hintBtn) {
    const hintBtnText = (await hintBtn.textContent()).trim();
    console.log(`Initial Hint Button Label: "${hintBtnText}"`);
    
    // Check active hints container in DOM
    const activeHints = await page.$$eval('#stage-active-hint-container .stage-hint-box', boxes => {
      return boxes.map(b => b.textContent.replace(/\s+/g, ' ').trim());
    });
    console.log(`Active Hint Boxes Rendered: ${activeHints.length}`);
    activeHints.forEach((h, i) => console.log(`  Box ${i + 1}: "${h}"`));
  }

  await browser.close();
  await new Promise(r => server.close(r));
  console.log('\n=== DIAGNOSTIC RUN FINISHED ===');
}

runDiagnosis().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
