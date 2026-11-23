// ==============================================================================
// FINAL OVERRIDE — STAGE 2 CRYPTANALYST WORKBENCH API
// Handles synchronized workbench state, optimistic updates, and audit logging
// ==============================================================================

const express = require('express');
const router = express.Router();
const ds = require('../../dataService');
const { requireTeam } = require('./middleware');

// In-memory sliding rate-limiter: max 10 requests per second per team
const workbenchRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

function checkWorkbenchRateLimit(teamId) {
  const now = Date.now();
  const history = workbenchRateLimits.get(teamId) || [];
  const validHistory = history.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (validHistory.length >= MAX_REQUESTS_PER_WINDOW) {
    workbenchRateLimits.set(teamId, validHistory);
    return false;
  }
  validHistory.push(now);
  workbenchRateLimits.set(teamId, validHistory);
  return true;
}

// GET /api/stage2/workbench - Fetch current workbench state
router.get('/stage2/workbench', requireTeam, async (req, res) => {
  try {
    const team = req.team;
    if (team.stage !== 2) {
      return res.status(400).json({ error: 'Team is not on Stage 2' });
    }
    const state = await ds.getStage2Workbench(team.id);
    return res.json({ ok: true, state });
  } catch (err) {
    console.error('Error fetching stage2 workbench:', err);
    return res.status(500).json({ error: 'Failed to load workbench state' });
  }
});

// PUT /api/stage2/workbench - Optimistic state modification with version conflict checking
router.put('/stage2/workbench', requireTeam, async (req, res) => {
  try {
    const team = req.team;
    if (team.stage !== 2) {
      return res.status(400).json({ error: 'Team is not on Stage 2' });
    }

    if (!checkWorkbenchRateLimit(team.id)) {
      return res.status(429).json({ error: 'Too many workbench operations. Please wait a second.' });
    }

    const { action, moduleIndex, key, expectedVersion } = req.body || {};
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'Action is required' });
    }

    const currentWb = await ds.getStage2Workbench(team.id);
    let payloadLoaded = currentWb.payloadLoaded;
    let steps = [...currentWb.steps];
    let details = null;

    switch (action) {
      case 'load':
        payloadLoaded = true;
        details = { loaded: true };
        break;

      case 'apply': {
        const idx = parseInt(moduleIndex, 10);
        if (isNaN(idx) || idx < 1 || idx > 6) {
          return res.status(400).json({ error: 'Invalid module index: must be an integer between 1 and 6' });
        }
        if (steps.some(s => s.t === 'm' && s.i === idx)) {
          return res.status(400).json({ error: `Decoder module ${idx} has already been applied in this sequence.` });
        }
        steps.push({ t: 'm', i: idx });
        details = { moduleIndex: idx };
        break;
      }

      case 'vigenere': {
        if (typeof key !== 'string') {
          return res.status(400).json({ error: 'Vigenère key must be a string' });
        }
        const cleanKey = key.trim();
        if (cleanKey.length === 0 || cleanKey.length > 12 || !/^[1-9]+$/.test(cleanKey)) {
          return res.status(400).json({ error: 'Vigenère key must contain 1 to 12 digits [1-9] only (no letters or zeroes)' });
        }
        steps.push({ t: 'v', k: cleanKey });
        details = { key: cleanKey };
        break;
      }

      case 'undo': {
        if (steps.length === 0) {
          return res.status(400).json({ error: 'No steps to undo' });
        }
        const popped = steps.pop();
        details = { undoneStep: popped };
        break;
      }

      case 'reset': {
        steps = [];
        details = { reset: true };
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown workbench action: ${action}` });
    }

    const saveResult = await ds.saveStage2Workbench(team.id, {
      payloadLoaded,
      steps,
      expectedVersion: typeof expectedVersion === 'number' ? expectedVersion : currentWb.version,
      action,
      details
    });

    if (!saveResult.ok && saveResult.conflict) {
      const freshWb = await ds.getStage2Workbench(team.id);
      return res.status(409).json({
        error: 'Version conflict: workbench was updated in another session',
        currentVersion: saveResult.currentVersion,
        state: freshWb
      });
    }

    return res.json({ ok: true, state: saveResult.state });
  } catch (err) {
    console.error('Error updating stage2 workbench:', err);
    return res.status(500).json({ error: 'Failed to update workbench state' });
  }
});

module.exports = router;
