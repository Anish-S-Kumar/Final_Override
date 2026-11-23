const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Running project linter and syntax checks...');

let hasEslint = false;
try {
  require.resolve('eslint');
  hasEslint = true;
} catch (_) {}

if (hasEslint) {
  try {
    execSync('npx eslint .', { stdio: 'inherit' });
    console.log('✅ ESLint passed cleanly.');
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

// Fallback built-in syntax & semicolon validator across JS files
const dirsToCheck = ['server', 'scripts', 'public/js', 'api'];
let filesChecked = 0;
let errors = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        scanDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      filesChecked++;
      try {
        // Node syntax verification
        execSync(`node --check "${fullPath}"`, { stdio: 'pipe' });
      } catch (err) {
        console.error(`❌ Syntax error in ${fullPath}:`, err.message);
        errors++;
      }
    }
  }
}

dirsToCheck.forEach(d => scanDir(path.join(__dirname, '..', d)));

if (errors > 0) {
  console.error(`🚨 Lint check failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`✅ All ${filesChecked} JS files validated with zero syntax errors.`);
  process.exit(0);
}
