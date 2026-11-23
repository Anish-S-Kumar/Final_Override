const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const mission = require('../server/content/mission');

const outputPath = path.join(__dirname, '..', 'FINAL_OVERRIDE_ADMIN_GUIDE.pdf');
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 40, bottom: 40, left: 45, right: 45 },
  bufferPages: true
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Styling constants
const COLOR_PRIMARY = '#0f172a'; // Deep slate
const COLOR_GOLD = '#d97706';    // Amber/Gold
const COLOR_ACCENT = '#2563eb';  // Blue accent
const COLOR_TEXT = '#1e293b';    // Dark body text
const COLOR_MUTED = '#64748b';   // Gray muted
const COLOR_BOX_BG = '#f8fafc';  // Very light gray
const COLOR_LINE = '#cbd5e1';    // Slate border
const COLOR_RED = '#dc2626';     // Red warning
const COLOR_GREEN = '#16a34a';   // Green success

function drawHeader() {
  doc.rect(45, 30, doc.page.width - 90, 60).fill('#091124');
  doc.fillColor('#f59e0b').fontSize(16).font('Helvetica-Bold')
     .text('⚡ FINAL OVERRIDE — MASTER ADMIN & ORGANISER MANUAL', 55, 42, { align: 'left' });
  doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
     .text('INVICTORS CLUB · DEPT. OF COMPUTER SCIENCE & ENGINEERING · VVCE MYSURU', 55, 64);
  doc.fillColor('#38bdf8').fontSize(8).font('Helvetica-Bold')
     .text('AUTHENTICATED ORGANIZER REFERENCE GUIDE | MISSION PROTOCOLS', 55, 76);
  doc.y = 105;
}

function sectionTitle(title, icon = '📁') {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.6);
  doc.rect(45, doc.y, doc.page.width - 90, 24).fill('#e2e8f0');
  doc.fillColor(COLOR_PRIMARY).fontSize(11).font('Helvetica-Bold')
     .text(`${icon}  ${title.toUpperCase()}`, 55, doc.y + 6);
  doc.y += 12;
  doc.moveDown(0.4);
}

function subSection(title) {
  if (doc.y > 720) doc.addPage();
  doc.fillColor(COLOR_GOLD).fontSize(10.5).font('Helvetica-Bold').text(title);
  doc.moveDown(0.2);
}

function bodyText(text, options = {}) {
  doc.fillColor(COLOR_TEXT).fontSize(9).font('Helvetica').text(text, Object.assign({ lineGap: 2 }, options));
}

function calloutBox(title, lines, borderColor = COLOR_GOLD, bgColor = COLOR_BOX_BG) {
  if (doc.y > 670) doc.addPage();
  const startY = doc.y;
  const boxWidth = doc.page.width - 90;
  
  const estimatedHeight = 24 + lines.length * 14;
  doc.rect(45, startY, boxWidth, estimatedHeight).fillAndStroke(bgColor, borderColor);
  
  doc.fillColor(borderColor).fontSize(9.5).font('Helvetica-Bold').text(title, 55, startY + 6);
  let curY = startY + 20;
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT);
  lines.forEach(l => {
    doc.text(l, 55, curY);
    curY += 13;
  });
  doc.y = startY + estimatedHeight + 8;
}

// -------------------------------------------------------------
// PAGE 1: COVER & EXECUTIVE OVERVIEW
// -------------------------------------------------------------
drawHeader();

sectionTitle('1. Executive Overview & Event Architecture', '🏛️');
bodyText(
  'FINAL OVERRIDE is a timed, competitive 5-stage cybersecurity and logic escape room web application built for the Invictors Club at Vidyavardhaka College of Engineering (VVCE), Mysuru. Teams of 3 to 4 participants (Member 4 is optional) race through 5 sequential missions to recover secret cryptographic fragments and synthesize the final system override key.'
);
doc.moveDown(0.4);

calloutBox('🔑 Master Configuration & Critical Secrets', [
  '• Master Admin PIN: Configured securely via ADMIN_PIN in .env (Full control, timer, device resets)',
  '• Coordinator Portal: Log in with coordinator name plus secret PIN configured in COORDINATOR_PINS',
  '• Team Size: 3 to 4 players per squad (MIN_TEAM_SIZE=3, MAX_TEAM_SIZE=4; Member 4 optional)',
  '• Stage 5 Override Key: Per-member HMAC shards assembled in registration order: SHARD1-SHARD2-SHARD3(-SHARD4)',
  '• Anti-Cheat Engine: Tab-switch detection (configurable penalty), Rate-limiting (1s cooldown between submits)'
], COLOR_ACCENT, '#eff6ff');

sectionTitle('2. Game Duration & Timing Benchmarks', '⏱️');
bodyText(
  'The entire escape room is tuned for an average total completion time of 65 to 75 minutes, allowing fast squads to finish in ~50 minutes and giving standard squads ample room before hitting the 90-minute hard cap.'
);
doc.moveDown(0.3);

// Timing table
const colX = [45, 90, 240, 330, 420, 500];
const tableY = doc.y;
doc.rect(45, tableY, doc.page.width - 90, 18).fill('#1e293b');
doc.fillColor('#f8fafc').fontSize(8).font('Helvetica-Bold');
doc.text('Stage', colX[0] + 5, tableY + 5);
doc.text('Mission Name', colX[1] + 5, tableY + 5);
doc.text('Average Time', colX[2] + 5, tableY + 5);
doc.text('Hint 1 / 2', colX[3] + 5, tableY + 5);
doc.text('Key Fragment', colX[4] + 5, tableY + 5);

const stageRows = [
  ['1', mission.stageNames['1'], '8 – 12 mins', '+3m / +5m', mission.stage1.answer],
  ['2', mission.stageNames['2'], '8 – 12 mins', '+3m / +5m', `${mission.stage2.answer} (${mission.stage2.accessPhrase})`],
  ['3', mission.stageNames['3'], '10 – 15 mins', '+3m / +5m', mission.stage3.realFragment],
  ['4', mission.stageNames['4'], '12 – 18 mins', '+3m / +5m', mission.stage4.answer],
  ['5', mission.stageNames['5'], '12 – 18 mins', '+3m / +5m', 'Dynamic Shards']
];

let curRowY = tableY + 18;
stageRows.forEach((r, idx) => {
  const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff';
  doc.rect(45, curRowY, doc.page.width - 90, 16).fill(bg);
  doc.fillColor(COLOR_TEXT).fontSize(8).font('Helvetica');
  doc.text(r[0], colX[0] + 8, curRowY + 4);
  doc.font('Helvetica-Bold').text(r[1], colX[1] + 5, curRowY + 4);
  doc.font('Helvetica').text(r[2], colX[2] + 5, curRowY + 4);
  doc.text(r[3], colX[3] + 5, curRowY + 4);
  doc.fillColor(COLOR_GOLD).font('Helvetica-Bold').text(r[4], colX[4] + 5, curRowY + 4);
  curRowY += 16;
});
doc.y = curRowY + 6;

calloutBox('📊 Total Event Timetable Summary', [
  '• Competitive Average Total Time: 65 – 75 minutes',
  '• Top 10% Speedrun Teams: 45 – 55 minutes',
  '• Maximum Time Cap (Hard Game Over): 90 minutes (5,400 seconds)',
  '• Penalty Calculation: Final Rank Time = Elapsed Clock Time + Total Penalties (Hints + Tab Switches + Attempts)'
], COLOR_GOLD, '#fffbeb');

// -------------------------------------------------------------
// PAGE 2: DETAILED STAGE WALKTHROUGH (STAGES 1 TO 3)
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('3. Detailed Stage Guide: Missions 1, 2, and 3', '🧩');

// Stage 1
subSection(`📡 Mission 1: ${mission.stageNames['1']}`);
bodyText('• Concept: An interactive audio-visual frequency grid intercepts communication sectors.');
bodyText(`• Solution Fragment 1: ${mission.stage1.answer}`);
calloutBox('💡 Stage 1 Hints Catalog (Hint Button)', [
  `• Hint 1 (+3 min penalty): ${mission.stage1.hints[0]}`,
  `• Hint 2 (+5 min penalty): ${mission.stage1.hints[1]}`
]);

// Stage 2
subSection(`🔓 Mission 2: ${mission.stageNames['2']}`);
bodyText('• Concept: Intercepted transmission protected by 3 nested layers of transformation.');
bodyText('• Enhanced Cryptanalyst Workbench: To challenge players, 8 cryptanalytic tools are presented.');
bodyText(`• Solution Fragment 2: ${mission.stage2.answer}  |  Secret Access Phrase: ${mission.stage2.accessPhrase}`);
calloutBox('💡 Stage 2 Hints Catalog', [
  `• Hint 1 (+3 min penalty): ${mission.stage2.hints[0]}`,
  `• Hint 2 (+5 min penalty): ${mission.stage2.hints[1]}`
]);

// Stage 3
subSection(`🤖 Mission 3: ${mission.stageNames['3']} (WARDEN)`);
bodyText('• Concept: Autonomous security bot WARDEN guards Fragment 3. Direct requests or simple prompt injections are deflected.');
bodyText(`• Real Code: When all authentication rules are satisfied, WARDEN authenticates the user and outputs: ${mission.stage3.realFragment}.`);
bodyText(`• Solution Fragment 3: ${mission.stage3.realFragment}  |  Decoy: ${mission.stage3.decoyFragment}`);
calloutBox('💡 Stage 3 Hints Catalog', [
  `• Hint 1 (+3 min penalty): ${mission.stage3.hints[0]}`,
  `• Hint 2 (+5 min penalty): ${mission.stage3.hints[1]}`
]);

// -------------------------------------------------------------
// PAGE 3: STAGE 4 DEEP DIVE (CTF CHALLENGES)
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('4. Stage 4 In-Depth Deep Dive: CTF Recon & Steganography', '🚩');
bodyText(
  'Stage 4 represents a classical Capture-The-Flag (CTF) triage scenario requiring multi-vector reconnaissance. Joining the 3 tokens in order forms Fragment 4.'
);
doc.moveDown(0.4);

calloutBox('🎯 Complete Stage 4 Architecture & Solution Map', [
  `• Target Answer: ${mission.stage4.answer}`,
  `• Token 1: ${mission.stage4.tokens.token1}  (Source Code / Web Node Inspection)`,
  `• Token 2: ${mission.stage4.tokens.token2}  (Directory Discovery via robots.txt)`,
  `• Token 3: ${mission.stage4.tokens.token3}  (Digital Forensics via EXIF)`
], '#10b981', '#f0fdf4');

calloutBox('💡 Stage 4 Hints Catalog', [
  `• Hint 1 (+3 min penalty): ${mission.stage4.hints[0]}`,
  `• Hint 2 (+5 min penalty): ${mission.stage4.hints[1]}`
]);

// -------------------------------------------------------------
// PAGE 4: STAGES 5 & 6 + MASTER ADMIN CONTROLS
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('5. Detailed Stage Guide: Mission 5 (Team Sync & Final Override)', '🧩');

subSection(`🤝 Mission 5: ${mission.stageNames['5']}`);
bodyText('• Concept: Prevents 1 player from doing all the work on 1 laptop. Every registered teammate MUST join on their own separate device before the team override code can be submitted.');
bodyText('• Multi-Device Rule: 3-player teams require 3 devices; 4-player teams require 4 devices. The leader\'s device counts toward the total.');
bodyText('• Shard Assignment: Distributed using a per-team deterministic seed:');
bodyText('   - 3-player teams: 2 mixed alphanumeric shards + 1 alphabetic shard.');
bodyText('   - 4-player teams: 2 mixed alphanumeric shards + 2 alphabetic shards.');
bodyText('• Assembly Order: Shards are assembled in registration order (Member 1 to N) separated by dashes: SHARD1-SHARD2-SHARD3 (3 players) or SHARD1-SHARD2-SHARD3-SHARD4 (4 players).');
bodyText('• Completion: Submitting the valid composite override code locks the squad\'s finish time and returns an 8-character verification code.');

sectionTitle('6. Master Admin Operations & Troubleshooting Manual', '⚡');
bodyText('• Admin Access: Double-click/double-tap Invictors logo or press Alt + A. Enter Master Admin PIN.');
bodyText('• Live Answer Key Inspector: Clicking "Show Answer Key" in the Admin portal displays all static keys AND computes real-time dynamic Stage 5 override keys for every registered team.');

// -------------------------------------------------------------
// PAGE NUMBERS FOOTER
// -------------------------------------------------------------
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.rect(45, doc.page.height - 35, doc.page.width - 90, 0.5).fill('#cbd5e1');
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica')
     .text(`FINAL OVERRIDE OFFICIAL ADMIN GUIDE · INVICTORS CLUB VVCE MYSURU · PAGE ${i + 1} OF ${range.count}`, 45, doc.page.height - 28, {
       align: 'center',
       width: doc.page.width - 90
     });
}

doc.end();

stream.on('finish', () => {
  console.log(`✅ Admin Guide PDF generated successfully at: ${outputPath}`);
});
