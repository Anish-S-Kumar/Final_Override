// FINAL OVERRIDE — Centralized Hint Processing Service
// Enforces rules HR1–HR9: deterministic costs, stage 1 repeatable morse unlock,
// atomic penalty application, idempotency protection, and visible duration controls.

const express = require('express');
const router = express.Router();
const ds = require('../../dataService');
const { STAGE_CONFIG } = require('../../logic/stages');
const { generateStage1Chart } = require('../../logic/stage1Randomizer');
const { withLock } = require('../../services/lockService');
const { queryCache } = require('../../services/queryCache');
const { getNow } = require('../../services/clock');
const { requireTeam } = require('./middleware');

// Per-team rate limit: 1 request per 2 seconds
const teamHintRateLimits = new Map();

// POST /api/hint - Request a hint for current stage
router.post('/hint', requireTeam, async (req, res) => {
  try {
    const now = getNow(req);
    const teamId = req.team.id;

    // Rate limiting: 1 request per 2s per team
    const lastCall = teamHintRateLimits.get(teamId) || 0;
    if (now - lastCall < 2000) {
      res.set('Retry-After', '2');
      return res.status(429).json({ error: 'Please wait 2 seconds between hint requests.' });
    }
    teamHintRateLimits.set(teamId, now);

    return await withLock(teamId, async () => {
      const team = await ds.getTeamById(teamId);
      if (!team) return res.status(401).json({ error: 'Team not found.' });

      if (team.finishedAt) {
        return res.status(400).json({ error: 'Mission already completed.' });
      }

      if (team.status === 'waiting') {
        return res.status(400).json({ error: 'The game has not started yet.' });
      }

      const clockPausedVal = await ds.getSetting('clockPaused', 'false');
      const isClockPaused = clockPausedVal === 'true';
      if (isClockPaused || team.isPaused === 1) {
        return res.status(400).json({ error: 'Mission is paused by organisers.' });
      }

      const stage = team.stage;
      const stageConfig = STAGE_CONFIG[stage];
      if (!stageConfig) {
        return res.status(400).json({ error: 'No hints available for this mission.' });
      }

      // Check memorise phase for Stage 1: if chart is already open for free, block hint purchase
      if (stage === 1) {
        const memoriseMs = (stageConfig.memoriseSeconds || 300) * 1000;
        const stage1OpensAt = team.stage1OpensAt != null
          ? team.stage1OpensAt
          : (team.stage1EnteredAt ? team.stage1EnteredAt + memoriseMs : team.startedAt + memoriseMs);
        if (now < stage1OpensAt) {
          return res.status(400).json({
            error: 'The Morse chart is already visible during the memorise phase.',
            memoriseActive: true
          });
        }
      }

      // Idempotency check via header
      const idempKey = req.headers['idempotency-key'] || null;
      if (idempKey) {
        const cachedRes = queryCache.get(`hint_idemp_${idempKey}`);
        if (cachedRes) {
          return res.json(cachedRes);
        }
      }

      // Delegate to unified repository requestHint
      const result = await ds.requestHint(team.id, stage, idempKey, now);
      if (!result || !result.ok) {
        return res.status(400).json({ error: result?.error || 'Failed to unlock hint.' });
      }

      queryCache.delete(`team_state_${team.id}`);

      let morseChart = undefined;
      if (stage === 1) {
        morseChart = generateStage1Chart(team.seed || team.id || team.name);
      }

      const remainingDurationSec = result.visibleUntil && result.visibleUntil > now
        ? Math.max(0, Math.ceil((result.visibleUntil - now) / 1000))
        : 0;

      const responsePayload = {
        success: true,
        ok: true,
        kind: result.kind,
        content: result.content,
        text: result.content,
        hint: result.content,
        visibleUntil: result.visibleUntil,
        displayDurationSeconds: remainingDurationSec,
        serverNow: now,
        costMinutes: result.costMinutes,
        cost: result.costMinutes,
        useNumber: result.useNumber,
        usesTotal: result.usesTotal,
        nextCostMinutes: result.nextCostMinutes,
        newPenaltyMinutes: result.newPenaltyMinutes,
        penaltyMin: result.newPenaltyMinutes,
        hintsUsed: result.useNumber,
        alreadyActive: Boolean(result.alreadyActive),
        idempotent: Boolean(result.idempotent),
        morseChart,
        chart: morseChart
      };

      if (idempKey) queryCache.set(`hint_idemp_${idempKey}`, responsePayload, 30000);

      return res.json(responsePayload);
    });
  } catch (err) {
    console.error('Hint API error:', err);
    return res.status(500).json({ error: 'Failed to unlock hint.' });
  }
});

module.exports = router;
