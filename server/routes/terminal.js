const express = require('express');
const router = express.Router();
const ds = require('../dataService');
const mission = require('../content/mission');

// In-memory virtual filesystem built from mission.json
function getVirtualFS() {
  const token1Comment = mission.stage4.commentToken;
  const token2Val = mission.stage4.tokens.token2;
  const token3Val = mission.stage4.tokens.token3;

  return {
    files: {
      'index.html': `<!DOCTYPE html>\n${token1Comment}\n<html>\n<head><title>Secure Facility Node</title></head>\n<body><h1>Mission 4 CTF Node</h1></body>\n</html>`,
      'robots.txt': 'User-agent: *\nDisallow: /vault-7f3a/',
      'vault-7f3a/note.txt': `token2 = ${token2Val}`
    },
    exif: {
      'badge.jpg': `File: badge.jpg\nComment: token3 = ${token3Val}`
    },
    dirs: {
      '': 'index.html robots.txt badge.jpg',
      '.': 'index.html robots.txt badge.jpg',
      'vault-7f3a': 'note.txt'
    }
  };
}

router.post('/', async (req, res) => {
  try {
    const leaderToken = req.cookies.fo_leader_token;
    if (!leaderToken) {
      return res.status(401).json({ error: 'Unauthorized: Team session required.' });
    }

    const team = await ds.getTeamByToken(leaderToken);
    if (!team) {
      return res.status(401).json({ error: 'Team not found.' });
    }

    if (team.stage !== 4) {
      return res.status(403).json({ error: 'Terminal is only accessible in Stage 4.' });
    }

    const rawCmd = (req.body.cmd || '').trim();
    if (!rawCmd) {
      return res.json({ output: '' });
    }

    const parts = rawCmd.split(/\s+/);
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    // Security check: reject directory traversal, absolute paths, and backslashes
    const isIllegalPath = (pathStr) => {
      if (!pathStr) return false;
      return pathStr.includes('..') || pathStr.startsWith('/') || pathStr.startsWith('\\') || pathStr.includes('\\');
    };

    const vfs = getVirtualFS();
    let output = '';

    if (command === 'help') {
      output = 'Commands: ls, ls <folder>, cat <file>, exif <file>, clear';
    } else if (command === 'clear') {
      return res.json({ output: '', clear: true });
    } else if (command === 'ls') {
      if (isIllegalPath(arg)) {
        output = 'Directory not found.';
      } else {
        const cleanDir = arg.replace(/^\.\//, '').replace(/\/$/, '');
        if (vfs.dirs[cleanDir] !== undefined) {
          output = vfs.dirs[cleanDir];
        } else {
          output = 'Directory not found.';
        }
      }
    } else if (command === 'cat') {
      if (!arg || isIllegalPath(arg)) {
        output = 'File not found.';
      } else {
        const cleanFile = arg.replace(/^\.\//, '');
        if (vfs.files[cleanFile] !== undefined) {
          output = vfs.files[cleanFile];
        } else {
          output = 'File not found.';
        }
      }
    } else if (command === 'exif') {
      if (!arg || isIllegalPath(arg)) {
        output = 'File not found.';
      } else {
        const cleanFile = arg.replace(/^\.\//, '');
        if (vfs.exif[cleanFile] !== undefined) {
          output = vfs.exif[cleanFile];
        } else {
          output = 'File not found or no EXIF metadata.';
        }
      }
    } else {
      output = 'Command not found. Type help';
    }

    return res.json({ output });
  } catch (err) {
    console.error('Terminal error:', err);
    return res.status(500).json({ error: 'Terminal execution failure.' });
  }
});

module.exports = router;
