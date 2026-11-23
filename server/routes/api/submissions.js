const express = require('express');
const router = express.Router();
const ds = require('../../dataService');
const config = require('../../config');
const { norm, hashAnswer, generateVerificationCode } = require('../../logic/security');
const mission = require('../../content/mission');
const { computeStage5Override } = require('../../logic/stage5Override');
const { computeTeamCode } = require('../../logic/shard');
const { computeFinalKey } = require('../../logic/finalKey');
const { withLock } = require('../../services/lockService');
const { queryCache } = require('../../services/queryCache');
const { getNow } = require('../../services/clock');
const { requireTeam } = require('./middleware');

// In-memory rate limiting map: teamId -> lastSubmitTimestamp
const lastSubmissions = new Map();

// POST /api/submit - Submit answer
router.post('/submit', requireTeam, async (req, res) => {
  try {
    const idempKey = req.headers['idempotency-key'];
    if (idempKey) {
      const cached = queryCache.get(`idemp_${idempKey}`);
      if (cached) {
        return res.status(cached.status).json(cached.body);
      }
    }

    return await withLock(req.team.id, async () => {
      function sendResult(status, body) {
        queryCache.delete(`team_state_${req.team.id}`);
        if (idempKey) {
          queryCache.set(`idemp_${idempKey}`, { status, body }, 60000);
        }
        return res.status(status).json(body);
      }
      const team = await ds.getTeamById(req.team.id);
      if (!team) return res.status(401).json({ error: 'Team not found.' });

      if (team.finishedAt) {
        return res.status(400).json({ error: 'Mission already completed.' });
      }

      if (team.status === 'waiting') {
        return res.status(400).json({ error: 'The game has not started yet. Waiting for organiser to launch! 🚀' });
      }

      if (team.status === 'timed_out') {
        return res.status(400).json({ error: 'Time expired. The event duration cap has been reached.' });
      }

      const clockPausedVal = await ds.getSetting('clockPaused', 'false');
      const isClockPaused = clockPausedVal === 'true';
      if (isClockPaused || team.isPaused === 1) {
        return res.status(400).json({ error: 'Mission is currently paused by organisers. Submissions are temporarily on hold.' });
      }

      const now = getNow(req);

      // Check time cap enforcement if enabled
      if (config.TIME_CAP_ENFORCED && team.startedAt) {
        const capMs = (config.TIME_CAP_MINUTES || 90) * 60 * 1000;
        const effectiveElapsed = now - team.startedAt - (team.pausedMs || 0);
        if (effectiveElapsed > capMs) {
          await ds.updateTeam(team.id, { status: 'timed_out' });
          return sendResult(400, {
            error: 'Time expired. The event duration cap has been reached.',
            timedOut: true
          });
        }
      }

      // Rate limit: 1 submission per second per team (unless test mode)
      const isTest = process.env.NODE_ENV === 'test';
      const lastTime = lastSubmissions.get(team.id) || 0;
      if (!isTest && (now - lastTime < 1000)) {
        return sendResult(429, { error: 'Please wait a second before submitting again.' });
      }
      lastSubmissions.set(team.id, now);

      const stage = team.stage;
      const rawAnswer = req.body.answer;
      const normalizedInput = norm(rawAnswer);

      if (!normalizedInput) {
        return sendResult(400, { error: 'Answer cannot be empty.' });
      }

      const members = await ds.getMembers(team.id);

      let isCorrect = false;
      let fragmentFound = null;

      if (stage === 1) {
        // Enforce memorise duration lock on first entry (server-authoritative)
        const memoriseSec = mission.stage1?.memoriseSeconds || 300;
        const memoriseMs = memoriseSec * 1000;
        const stage1OpensAt = team.stage1OpensAt != null ? team.stage1OpensAt : (team.stage1EnteredAt ? team.stage1EnteredAt + memoriseMs : team.startedAt + memoriseMs);
        if (now < stage1OpensAt) {
          const secLeft = Math.ceil((stage1OpensAt - now) / 1000);
          return sendResult(400, {
            error: `Phase 1 (Memorise) is active. The transmission stream is calibrating. Submissions unlock in ${secLeft} seconds.`,
            locked: true,
            remainingSeconds: secLeft
          });
        }

        if (normalizedInput === 'ZETA9') {
          return sendResult(400, {
            error: 'Trap alert triggered: ZETA9 is an intercepted decoy! Ignore it and assemble the authentic sector letters.',
            isDecoy: true
          });
        }
        isCorrect = normalizedInput === norm(mission.stage1.answer);
        fragmentFound = mission.stage1.answer;
      } else if (stage === 2) {
        // Deterministic sequence derivation and lowercase requirement
        const teamSequence = await ds.getTeamSequence(team.id);
        const expectedAnswer = teamSequence ? teamSequence.expectedAnswer : (mission.stage2.answer || '8m4k7r9x').toLowerCase();

        // Strip spaces and hyphens
        const cleanedInput = String(rawAnswer || '').replace(/[\s\-]/g, '');
        // Check if matching in lowercase
        if (cleanedInput.toLowerCase() === expectedAnswer.toLowerCase()) {
          if (cleanedInput !== expectedAnswer.toLowerCase()) {
            // Player typed uppercase or mixed-case: friendly reminder without penalty or attempt increment
            return sendResult(400, {
              error: 'Enter your answer in lowercase. This attempt was not counted.',
              message: 'Enter your answer in lowercase. This attempt was not counted.',
              lowercaseRequired: true,
              penalty: 0
            });
          }
          isCorrect = true;
          fragmentFound = expectedAnswer;
        } else {
          isCorrect = false;
        }
      } else if (stage === 3) {
        isCorrect = normalizedInput === norm(mission.stage3.realFragment);
        fragmentFound = mission.stage3.realFragment;
      } else if (stage === 4) {
        isCorrect = normalizedInput === norm(mission.stage4.answer);
        fragmentFound = mission.stage4.answer;
      } else if (stage === 5) {
        // Stage 5 Team Sync & Multi-Device HMAC Link
        const joinedMembers = members.filter(m => m.deviceToken !== null);
        const distinctDevices = new Set(joinedMembers.map(m => m.deviceToken));
        const requiredCount = team.memberCount || members.length;
        if (distinctDevices.size < requiredCount) {
          return res.status(400).json({
            error: 'Stage 5 requires every member to join from their own device. Waiting for all teammates to connect. 🤝'
          });
        }

        const expectedCode = computeTeamCode(team.name, members);
        isCorrect = normalizedInput === norm(expectedCode);
        fragmentFound = expectedCode;
      } else if (stage === 6) {
        // Stage 6 Final Integration & Master Override
        const progressList = await ds.getProgress(team.id);
        const f1 = progressList.find(p => p.stage === 1)?.fragment || mission.stage1.answer;
        const seq = await ds.getTeamSequence(team.id);
        const f2 = progressList.find(p => p.stage === 2)?.fragment || seq?.expectedAnswer || mission.stage2.answer;
        const f3 = progressList.find(p => p.stage === 3)?.fragment || mission.stage3.realFragment;
        const f4 = progressList.find(p => p.stage === 4)?.fragment || mission.stage4.answer;
        const f5 = progressList.find(p => p.stage === 5)?.fragment || computeTeamCode(team.name, members);

        const expectedKey = computeFinalKey(f1, f2, f3, f4, f5);
        const fallbackKey = computeFinalKey(f1, mission.stage2.answer, f3, f4, f5);
        isCorrect = (normalizedInput === norm(expectedKey) || normalizedInput === norm(fallbackKey));
        fragmentFound = expectedKey;
      }

      // Record submission log including rawValue and idempotencyKey
      await ds.addSubmission({
        teamId: team.id,
        stage,
        valueHash: hashAnswer(normalizedInput),
        rawValue: String(rawAnswer).trim().slice(0, 100),
        ok: isCorrect ? 1 : 0,
        at: now,
        idempotencyKey: req.headers['idempotency-key'] || null
      });

      const progressRows = await ds.getProgress(team.id);
      const prog = progressRows.find(p => p.stage === stage) || { wrongAttempts: 0, hintsUsed: 0 };

      if (isCorrect) {
        // Update progress
        await ds.updateProgress(team.id, stage, {
          fragment: fragmentFound,
          solvedAt: now
        });

        let finishedAt = null;
        let nextStage = stage + 1;

        if (stage === 6) {
          // Exactly 6 stages: mission completed!
          finishedAt = now;
          nextStage = 6;
          await ds.updateTeam(team.id, { finishedAt, stage: 6 });
        } else {
          await ds.updateTeam(team.id, { stage: nextStage });
        }

        let verificationCode = null;
        if (finishedAt) {
          verificationCode = generateVerificationCode(team.name, team.startedAt, finishedAt);
        }

        return sendResult(200, {
          success: true,
          correct: true,
          stage,
          nextStage,
          fragment: fragmentFound,
          finished: !!finishedAt,
          verificationCode
        });
      } else {
        // Incorrect answer
        const newWrong = (prog ? prog.wrongAttempts : 0) + 1;
        let extraPenalty = 0;
        if (newWrong > 5) {
          extraPenalty = 1; // +1 min penalty
        }

        const newTeamPenalty = (team.penaltyMin || 0) + extraPenalty;

        await ds.updateProgress(team.id, stage, { wrongAttempts: newWrong });

        if (extraPenalty > 0) {
          await ds.updateTeam(team.id, { penaltyMin: newTeamPenalty });
        }

        return sendResult(200, {
          success: false,
          correct: false,
          wrongAttempts: newWrong,
          penaltyApplied: newWrong > 5,
          totalPenaltyMin: newTeamPenalty
        });
      }
    });
  } catch (err) {
    console.error('Submit API error:', err);
    return res.status(500).json({ error: 'Failed to process submission.' });
  }
});

// POST /api/tab-penalty - Anti-cheat tab switch penalty
router.post('/tab-penalty', requireTeam, async (req, res) => {
  try {
    const currentTeam = await ds.getTeamById(req.team.id);
    if (!currentTeam || currentTeam.finishedAt || currentTeam.status === 'waiting') {
      return res.json({ success: false });
    }

    const now = getNow(req);

    // Check Stage 4 exemption: Do not apply a penalty during Stage 4
    if (currentTeam.stage === 4) {
      await ds.addViolation({
        teamId: currentTeam.id,
        type: 'tab_switch',
        details: 'Tab switch during Stage 4 (exempt)',
        penaltyAdded: 0,
        at: now,
        stage: 4
      });
      return res.json({
        success: true,
        exempt: true,
        penaltyAdded: 0,
        totalPenaltyMin: currentTeam.penaltyMin || 0
      });
    }

    // Debounce: ignore a new event within 5 seconds of the last counted one
    const lastViolation = await ds.getLastTabViolation(currentTeam.id);
    if (lastViolation && (now - lastViolation.at < 5000)) {
      return res.json({ success: false, debounced: true });
    }

    // Grace period check: 3 seconds after page load or stage transition
    const withinGrace = req.body.withinGrace || false;

    // Cap check: Cap at 3 penalties per stage and 10 per team
    const stagePenaltyCount = await ds.getTabViolationsCount(currentTeam.id, currentTeam.stage);
    const totalPenaltyCount = await ds.getTabViolationsCount(currentTeam.id);

    const isEnabled = config.TAB_PENALTY_ENABLED;
    const penaltyRate = config.TAB_PENALTY_MINUTES || 1;

    let penaltyToAdd = 0;
    if (isEnabled && !withinGrace && stagePenaltyCount < 3 && totalPenaltyCount < 10) {
      penaltyToAdd = penaltyRate;
    }

    const newSwitches = (currentTeam.tabSwitches || 0) + 1;
    const newTotalPenalty = (currentTeam.penaltyMin || 0) + penaltyToAdd;

    await ds.updateTeam(currentTeam.id, {
      tabSwitches: newSwitches,
      penaltyMin: newTotalPenalty
    });

    await ds.addViolation({
      teamId: currentTeam.id,
      type: 'tab_switch',
      details: `Tab switched or left mission screen (violation #${newSwitches}, stage ${currentTeam.stage})`,
      penaltyAdded: penaltyToAdd,
      at: now,
      stage: currentTeam.stage
    });

    return res.json({
      success: true,
      tabSwitches: newSwitches,
      penaltyAdded: penaltyToAdd,
      totalPenaltyMin: newTotalPenalty
    });
  } catch (err) {
    console.error('Tab penalty API error:', err);
    return res.status(500).json({ error: 'Failed to record penalty.' });
  }
});

module.exports = router;
