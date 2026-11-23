// FINAL OVERRIDE — Production Build & Deployment Validation Script
const fs = require('fs');
const path = require('path');

console.log('🚀 Running FINAL OVERRIDE Build & Deployment Validation...\n');

let errors = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}`);
    errors++;
  }
}

// 1. Check critical files
console.log('1. Checking Critical Assets & Deployment Files:');
const requiredFiles = [
  'server/content/mission.json',
  'server/content/mission.example.json',
  'server/app.js',
  'server/index.js',
  'api/index.js',
  'server/db.js',
  'server/repositories/index.js',
  'server/repositories/sqliteRepository.js',
  'server/migrations/001_initial_schema.sql',
  'public/index.html',
  'public/css/tokens.css',
  'public/css/styles.css',
  'public/js/app.js'
];

for (const rel of requiredFiles) {
  const full = path.join(__dirname, '..', rel);
  check(`File exists: ${rel}`, fs.existsSync(full));
}

// 2. Validate mission config schemas
console.log('\n2. Validating Mission Configuration Schemas:');
try {
  const exampleJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/content/mission.example.json'), 'utf8'));
  check('mission.example.json is valid JSON', true);
  const hasStages = (exampleJson.stage1 && exampleJson.stage2 && exampleJson.stage3 && exampleJson.stage4 && exampleJson.stage5) || (exampleJson.stages && Object.keys(exampleJson.stages).length >= 5);
  check('mission.example.json has stage 1-5 definitions', Boolean(hasStages));
} catch (e) {
  check(`mission.example.json schema check failed: ${e.message}`, false);
}

try {
  const realJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/content/mission.json'), 'utf8'));
  check('mission.json is valid JSON', true);
  const hasStages = (realJson.stage1 && realJson.stage2 && realJson.stage3 && realJson.stage4 && realJson.stage5) || (realJson.stages && Object.keys(realJson.stages).length >= 5);
  check('mission.json has stage 1-5 definitions', Boolean(hasStages));
} catch (e) {
  check(`mission.json schema check failed: ${e.message}`, false);
}

// 3. Check App Export for Serverless / Monolith Dual Mode
console.log('\n3. Validating App Architecture:');
try {
  const app = require('../server/app');
  check('server/app.js exports Express application instance', typeof app === 'function' && typeof app.use === 'function');
} catch (e) {
  check(`server/app.js export failed: ${e.message}`, false);
}

// 4. Validate Code Linting
console.log('\n4. Running Syntax & Lint Verification:');
try {
  const { runLint } = require('./lint');
  const lintOk = runLint();
  check('Lint script passed with 0 errors', lintOk);
} catch (e) {
  check(`Lint runner failed: ${e.message}`, false);
}

console.log('\n' + '='.repeat(50));
if (errors === 0) {
  console.log('🎉 BUILD VALIDATION SUCCESSFUL: Ready for LAN and Vercel/stateless deploy!');
  process.exit(0);
} else {
  console.error(`❌ BUILD FAILED: ${errors} error(s) detected. Fix issues before deployment.`);
  process.exit(1);
}
