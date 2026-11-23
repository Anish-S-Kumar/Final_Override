const fs = require('fs');
const path = require('path');

const realPath = path.join(__dirname, 'mission.json');
const examplePath = path.join(__dirname, 'mission.example.json');

let missionData = null;

if (fs.existsSync(realPath)) {
  try {
    missionData = JSON.parse(fs.readFileSync(realPath, 'utf8'));
  } catch (err) {
    console.error('FATAL: server/content/mission.json is malformed JSON:', err.message);
    process.exit(1);
  }
} else if (process.env.NODE_ENV === 'test' && fs.existsSync(examplePath)) {
  missionData = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
} else {
  console.error('================================================================');
  console.error('FATAL: server/content/mission.json is MISSING!');
  console.error('Please copy server/content/mission.example.json to mission.json');
  console.error('and configure the secrets and answers before launching.');
  console.error('================================================================');
  process.exit(1);
}

module.exports = missionData;
