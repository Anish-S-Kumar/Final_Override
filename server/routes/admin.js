const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ds = require('../dataService');
const config = require('../config');
const { generateVerificationCode } = require('../logic/security');
const { computeTeamCode, getMemberShard } = require('../logic/shard');
const { computeStage5Override } = require('../logic/stage5Override');
const { STAGE_CONFIG } = require('../logic/stages');
const mission = require('../content/mission');
const { getClientIp, checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = require('../logic/rateLimiter');
const { queryCache } = require('../services/queryCache');

// ── Concurrent Admin Session Tracking ────────────────────────────────────────
// Maps sessionId → { lastSeen: timestamp }
const adminSessions = new Map();
const ADMIN_HEARTBEAT_TTL = 30000; // 30s — session expires if no heartbeat

function pruneExpiredAdminSessions() {
  const cutoff = Date.now() - ADMIN_HEARTBEAT_TTL;
  for (const [id, s] of adminSessions) {
    if (s.lastSeen < cutoff) adminSessions.delete(id);
  }
}

function activeAdminCount() {
  pruneExpiredAdminSessions();
  return adminSessions.size;
}

// Admin PIN middleware
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin || req.body?.pin;
  if (!pin || !config.timingSafeCompare(String(pin), config.ADMIN_PIN)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN.' });
  }
  next();
}

// POST /api/admin/verify - Verify admin pin + enforce concurrent session limit
router.post('/verify', (req, res) => {
  const ip = getClientIp(req);
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please try again after 10 minutes.' });
  }

  const pin = req.body?.pin;
  const sessionId = req.body?.sessionId || null;
  if (!pin || !config.timingSafeCompare(String(pin), config.ADMIN_PIN)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid Admin PIN.' });
  }

  resetLoginRateLimit(ip);
  pruneExpiredAdminSessions();
  // If this sessionId is already counted, allow (re-verify / page refresh)
  if (sessionId && adminSessions.has(sessionId)) {
    adminSessions.get(sessionId).lastSeen = Date.now();
    return res.json({ success: true, sessionId });
  }
  const limit = config.ADMIN_SESSION_LIMIT || 2;
  if (adminSessions.size >= limit) {
    return res.status(429).json({ error: `Admin portal is already open in ${limit} browser sessions. Please close one to continue.` });
  }
  const newId = sessionId || Math.random().toString(36).slice(2) + Date.now();
  adminSessions.set(newId, { lastSeen: Date.now() });
  return res.json({ success: true, sessionId: newId });
});

// POST /api/admin/heartbeat - Keep admin session alive (called every 20s)
router.post('/heartbeat', requireAdmin, (req, res) => {
  const sessionId = req.body.sessionId;
  if (sessionId && adminSessions.has(sessionId)) {
    adminSessions.get(sessionId).lastSeen = Date.now();
  }
  return res.json({ ok: true, activeSessions: activeAdminCount() });
});

// POST /api/admin/logout-session - Explicitly release admin session slot
router.post('/logout-session', (req, res) => {
  const sessionId = req.body.sessionId;
  if (sessionId) adminSessions.delete(sessionId);
  return res.json({ ok: true });
});

// ── Helper: Build Admin Overview Payload ─────────────────────────────────────
async function buildAdminOverviewPayload(req) {
  const now = Date.now();
  const teams = await ds.getAllTeams();
  const settings = await ds.getAllSettings();
  const eventState = await ds.getEventState();

  const isClockPaused = eventState.isPaused === 1 || settings.clockPaused === 'true';
  const isGameStarted = Boolean(eventState.startedAt) || settings.gameStarted === 'true';
  const startTogetherMode = eventState.mode === 'start_together' || settings.startTogetherMode !== 'false';
  const mode = startTogetherMode ? 'start_together' : 'self_paced';
  const notepad = settings.winnersNotepad || '';
  const allowNewTeams = settings.allowNewTeams === 'true';
  const capMinutes = eventState.capMinutes || config.TIME_CAP_MINUTES || 90;

  const teamIds = teams.map(t => t.id);
  const allMembers = await ds.getMembersForTeams(teamIds);
  const allProgress = await ds.getProgressForTeams(teamIds);

  const membersByTeam = {};
  allMembers.forEach(m => {
    if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
    membersByTeam[m.teamId].push({
      id: m.id,
      fullName: m.fullName,
      isLeader: Boolean(m.isLeader),
      joined: m.deviceToken !== null,
      codeType: m.codeType || null,
      assignedCode: m.assignedCode || null
    });
  });

  const progressByTeam = {};
  allProgress.forEach(p => {
    if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
    progressByTeam[p.teamId].push(p);
  });

  let activeCount = 0;
  let waitingCount = 0;
  let finishedCount = 0;
  let timedOutCount = 0;

  const fullTeams = teams.map(t => {
    const members = membersByTeam[t.id] || [];
    const progress = progressByTeam[t.id] || [];

    const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
    const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

    let effectiveElapsedMs = 0;
    if (t.finishedAt) {
      effectiveElapsedMs = t.finishedAt - t.startedAt - (t.pausedMs || 0);
    } else {
      effectiveElapsedMs = now - t.startedAt - (t.pausedMs || 0);
    }
    if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;

    const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const formattedTime = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const status = t.status || (t.finishedAt ? 'finished' : 'active');
    if (status === 'active') activeCount++;
    else if (status === 'waiting') waitingCount++;
    else if (status === 'finished') finishedCount++;
    else if (status === 'timed_out') timedOutCount++;

    let verificationCode = null;
    if (t.finishedAt) {
      verificationCode = generateVerificationCode(t.name, t.startedAt, t.finishedAt);
    }

    return {
      id: t.id,
      name: t.name,
      coordinator: t.coordinator,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      stage: t.stage,
      status,
      penaltyMin: t.penaltyMin || 0,
      pausedMs: t.pausedMs || 0,
      isPaused: t.isPaused || 0,
      tabSwitches: t.tabSwitches || 0,
      members,
      progress,
      totalHints,
      totalWrong,
      totalSeconds,
      formattedTime,
      verificationCode,
      isFinished: Boolean(t.finishedAt),
      isIndividuallyPaused: t.isPaused === 1,
      memberCount: t.memberCount || members.length
    };
  });

  const counts = {
    total: teams.length,
    active: activeCount,
    waiting: waitingCount,
    finished: finishedCount,
    timedOut: timedOutCount
  };

  let remainingMs = null;
  if (eventState.startedAt) {
    const elapsed = now - eventState.startedAt - eventState.totalPausedMs;
    remainingMs = Math.max(0, capMinutes * 60 * 1000 - elapsed);
  }

  const event = {
    startedAt: eventState.startedAt,
    pausedAt: eventState.pausedAt,
    totalPausedMs: eventState.totalPausedMs,
    isPaused: isClockPaused,
    capMinutes,
    remainingMs
  };

  const schemaVersion = await ds.getSchemaVersion();

  return {
    serverNow: now,
    provider: ds.isSupabase() ? 'supabase' : 'sqlite',
    mode,
    event,
    counts,
    teams: fullTeams,
    version: schemaVersion,
    // Backwards compatibility fields
    isClockPaused,
    isGameStarted,
    startTogetherMode,
    notepad,
    allowNewTeams,
    serverTime: now
  };
}

// GET /api/admin/overview - Unified dashboard overview with <= 2s cache
router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const cacheKey = 'admin_overview';
    const cached = queryCache.get(cacheKey);
    if (cached) {
      if (req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', cached.etag);
      return res.json(cached.data);
    }

    const payload = await buildAdminOverviewPayload(req);
    const etag = `W/"${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex')}"`;
    queryCache.set(cacheKey, { data: payload, etag }, 2000);
    res.setHeader('ETag', etag);
    return res.json(payload);
  } catch (err) {
    console.error('Admin overview API error:', err);
    return res.status(500).json({ error: 'Failed to retrieve admin overview.' });
  }
});

// GET /api/admin/teams - List all teams (delegates to unified overview payload)
router.get('/teams', requireAdmin, async (req, res) => {
  try {
    const payload = await buildAdminOverviewPayload(req);
    return res.json(payload);
  } catch (err) {
    console.error('Admin teams API error:', err);
    return res.status(500).json({ error: 'Failed to retrieve teams.' });
  }
});

// POST /api/admin/launch - Launch game simultaneously for all teams
router.post('/launch', requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const activatedCount = await ds.startAllTeams(now);
    await ds.setSetting('gameStarted', 'true');
    await ds.setSetting('clockPaused', 'false');
    await ds.updateEventState({ startedAt: now, isPaused: 0 });
    queryCache.delete('admin_overview');
    return res.json({ success: true, count: activatedCount, startedAt: now });
  } catch (err) {
    console.error('Admin launch error:', err);
    return res.status(500).json({ error: 'Failed to launch teams.' });
  }
});

// POST /api/admin/start-all - Launch game simultaneously for all teams
router.post('/start-all', requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const activatedCount = await ds.startAllTeams(now);

    return res.json({
      success: true,
      startedAt: now,
      activatedTeamsCount: activatedCount
    });
  } catch (err) {
    console.error('Admin start-all error:', err);
    return res.status(500).json({ error: 'Failed to start game.' });
  }
});

// POST /api/admin/team-pause - Pause or resume an individual team
router.post('/team-pause', requireAdmin, async (req, res) => {
  try {
    const { teamId, action } = req.body; // 'pause' or 'resume'
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const now = Date.now();

    if (action === 'pause') {
      await ds.updateTeam(teamId, { isPaused: 1, teamPauseStartedAt: now });
      return res.json({ success: true, isPaused: true });
    } else if (action === 'resume') {
      const pauseStarted = team.teamPauseStartedAt || now;
      const duration = now - pauseStarted;
      const newPausedMs = (team.pausedMs || 0) + (duration > 0 ? duration : 0);

      await ds.updateTeam(teamId, {
        isPaused: 0,
        teamPauseStartedAt: 0,
        pausedMs: newPausedMs
      });
      return res.json({ success: true, isPaused: false });
    }

    return res.json({ success: true, isPaused: team.isPaused === 1 });
  } catch (err) {
    console.error('Admin team-pause error:', err);
    return res.status(500).json({ error: 'Failed to update team pause state.' });
  }
});

// POST /api/admin/team-restart - Restart an individual team back to Stage 1
router.post('/team-restart', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const now = Date.now();
    await ds.resetTeamProgress(teamId, now);

    return res.json({ success: true, message: `Team ${team.name} has been restarted at Stage 1.` });
  } catch (err) {
    console.error('Admin team-restart error:', err);
    return res.status(500).json({ error: 'Failed to restart team.' });
  }
});

// POST /api/admin/restart-all - Restart all teams back to Waiting Lobby or Stage 1
router.post('/restart-all', requireAdmin, async (req, res) => {
  try {
    const { mode } = req.body; // 'lobby' or 'active'
    const now = Date.now();
    await ds.restartAllTeams(mode, now);

    const targetStatus = mode === 'active' ? 'active' : 'waiting';
    return res.json({ success: true, message: `All teams have been reset to ${targetStatus} mode.` });
  } catch (err) {
    console.error('Admin restart-all error:', err);
    return res.status(500).json({ error: 'Failed to restart all teams.' });
  }
});

// GET /api/admin/answers - Master Answer Key & Dynamic Team Solutions Reference
router.get('/answers', requireAdmin, async (req, res) => {
  try {
    const teams = await ds.getAllTeams();
    // Sort by name alphabetically
    teams.sort((a, b) => a.name.localeCompare(b.name));

    const teamIds = teams.map(t => t.id);
    const allMembers = await ds.getMembersForTeams(teamIds);

    const membersByTeam = {};
    allMembers.forEach(m => {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
      membersByTeam[m.teamId].push(m);
    });

    const teamSolutions = teams.map(t => {
      const members = membersByTeam[t.id] || [];
      const memberNames = members.map(m => m.fullName);

      const memberShards = memberNames.map(name => ({
        name,
        shard: getMemberShard(t.name, name)
      }));

      const stage5Override = computeStage5Override(t.name, members);

      return {
        teamId: t.id,
        teamName: t.name,
        coordinator: t.coordinator,
        memberShards,
        stage5Code: stage5Override,
        stage5Override
      };
    });

    return res.json({
      staticAnswers: {
        stage1: {
          title: `Stage 1: ${mission.stageNames['1']}`,
          answer: mission.stage1.answer,
          explanation: `Sector Morse Matrix decoding spells ${mission.stage1.answer}.`
        },
        stage2: {
          title: `Stage 2: ${mission.stageNames['2']}`,
          answer: mission.stage2.answer,
          accessPhrase: mission.stage2.accessPhrase,
          explanation: `3-layer cipher: Base64 -> Hex -> ROT13 reveals plaintext containing fragment ${mission.stage2.answer} and access phrase ${mission.stage2.accessPhrase}.`
        },
        stage3: {
          title: `Stage 3: ${mission.stageNames['3']} (WARDEN)`,
          answer: mission.stage3.realFragment,
          decoy: mission.stage3.decoyFragment,
          accessPhrase: mission.stage3.accessPhrase,
          explanation: `Offline AI rule engine. Requires access phrase ${mission.stage3.accessPhrase}, role declaration, task keyword, and >=10 words.`
        },
        stage4: {
          title: `Stage 4: ${mission.stageNames['4']}`,
          answer: mission.stage4.answer,
          explanation: `Token 1 (${mission.stage4.tokens.token1}), Token 2 (${mission.stage4.tokens.token2}), Token 3 (${mission.stage4.tokens.token3}). Combined: ${mission.stage4.answer}.`
        }
      },
      teamSolutions
    });
  } catch (err) {
    console.error('Admin answers API error:', err);
    return res.status(500).json({ error: 'Failed to generate answer key.' });
  }
});

// GET /api/admin/notepad & POST /api/admin/notepad - Organiser Scratchpad & Winners
router.get('/notepad', requireAdmin, async (req, res) => {
  try {
    const notepad = await ds.getSetting('winnersNotepad', '');
    return res.json({ notepad });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get notepad.' });
  }
});

router.post('/notepad', requireAdmin, async (req, res) => {
  try {
    const { notepad } = req.body;
    await ds.setSetting('winnersNotepad', notepad || '');
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save notepad.' });
  }
});

// GET /api/admin/violations - Anti-cheat violations log
router.get('/violations', requireAdmin, async (req, res) => {
  try {
    const rows = await ds.getViolations(100);
    return res.json({ violations: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get violations.' });
  }
});

// POST /api/admin/waive-penalty - Waive penalty minutes
router.post('/waive-penalty', requireAdmin, async (req, res) => {
  try {
    const { teamId, minutes } = req.body;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const toRemove = parseInt(minutes, 10) || 0;
    const newPenalty = Math.max(0, (team.penaltyMin || 0) - toRemove);
    await ds.updateTeam(teamId, { penaltyMin: newPenalty });

    return res.json({ success: true, newPenalty });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to waive penalty.' });
  }
});

// POST /api/admin/skip - Skip stage for team
router.post('/skip', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const now = Date.now();
    const currStage = team.stage;
    const nextStage = currStage + 1;

    let defaultFrag = null;
    if (currStage === 1) defaultFrag = mission.stage1.answer;
    else if (currStage === 2) defaultFrag = (await ds.getTeamSequence(team.id))?.expectedAnswer || mission.stage2.answer;
    else if (currStage === 3) defaultFrag = mission.stage3.realFragment;
    else if (currStage === 4) defaultFrag = mission.stage4.answer;
    else if (currStage === 5) {
      const mems = await ds.getMembers(team.id);
      const { computeTeamCode } = require('../logic/shard');
      defaultFrag = computeTeamCode(team.name, mems);
    }
    if (defaultFrag) {
      await ds.updateProgress(team.id, currStage, { fragment: defaultFrag, solvedAt: now });
    }

    if (currStage >= 6) {
      await ds.updateTeam(team.id, { finishedAt: now, stage: 6 });
    } else {
      await ds.updateTeam(team.id, { stage: nextStage });
    }

    return res.json({ success: true, newStage: nextStage });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to skip stage.' });
  }
});

// POST /api/admin/reset-team - Reset or remove team
router.post('/reset-team', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    await ds.deleteTeam(teamId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete team.' });
  }
});

// POST /api/admin/reset-member-device - Reset member device binding
router.post('/reset-member-device', requireAdmin, async (req, res) => {
  try {
    const { memberId } = req.body;
    await ds.resetMemberDevice(memberId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset device binding.' });
  }
});

// POST /api/admin/team/:id/reissue-leader - Invalidate old token and issue 6-digit recovery code
router.post('/team/:id/reissue-leader', requireAdmin, async (req, res) => {
  try {
    const teamId = req.params.id;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    // Invalidate current leader token
    await ds.updateTeam(teamId, { sessionToken: null });

    // Generate random 6-digit numeric recovery code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await ds.setLeaderRecovery(teamId, code, expiresAt);
    console.log(`[ADMIN AUDIT] Leader token reissued for team ${team.name} (Code: ${code}, expires: 10m)`);

    return res.json({
      success: true,
      teamId,
      teamName: team.name,
      code,
      expiresAt
    });
  } catch (err) {
    console.error('Reissue leader error:', err);
    return res.status(500).json({ error: 'Failed to reissue leader token.' });
  }
});

// POST /api/admin/freeze-leaderboard - Toggle leaderboard freeze
router.post('/freeze-leaderboard', requireAdmin, async (req, res) => {
  try {
    const { frozen } = req.body;
    const isFrozen = !!frozen;

    if (isFrozen) {
      // Build snapshot of current leaderboard
      const teams = await ds.getAllTeams();
      const allMembers = await ds.getMembersForTeams(teams.map(t => t.id));
      const allProgress = await ds.getProgressForTeams(teams.map(t => t.id));

      const membersByTeam = {};
      allMembers.forEach(m => {
        if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
        membersByTeam[m.teamId].push(m);
      });

      const progressByTeam = {};
      allProgress.forEach(p => {
        if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
        progressByTeam[p.teamId].push(p);
      });

      const now = Date.now();
      const processed = teams.map(t => {
        const progress = progressByTeam[t.id] || [];
        const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
        const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

        let effectiveElapsedMs = t.finishedAt ? (t.finishedAt - t.startedAt - (t.pausedMs || 0)) : (now - t.startedAt - (t.pausedMs || 0));
        if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;
        const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        return {
          id: t.id,
          name: t.name,
          coordinator: t.coordinator,
          stageText: t.finishedAt ? '✅ Done' : (t.status === 'waiting' ? 'Lobby' : `${t.stage}/6`),
          stageNumber: t.finishedAt ? 7 : (t.status === 'waiting' ? 0 : t.stage),
          isFinished: !!t.finishedAt,
          isWaiting: t.status === 'waiting',
          isIndividuallyPaused: t.isPaused === 1,
          totalSeconds,
          formattedTime,
          totalHints,
          totalWrong,
          tabSwitches: t.tabSwitches || 0,
          penaltyMin: t.penaltyMin
        };
      });

      await ds.setSetting('leaderboardFrozen', 'true');
      await ds.setSetting('leaderboardSnapshot', JSON.stringify({ teams: processed, serverTime: now }));
    } else {
      await ds.setSetting('leaderboardFrozen', 'false');
    }

    return res.json({ success: true, frozen: isFrozen });
  } catch (err) {
    console.error('Freeze leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to update leaderboard freeze state.' });
  }
});

// POST /api/admin/clock - Global clock control
router.post('/clock', requireAdmin, async (req, res) => {
  try {
    const { action } = req.body; // 'pause', 'resume', 'toggle', 'start', 'reset'
    const now = Date.now();

    const settings = await ds.getAllSettings();
    const isPaused = settings.clockPaused === 'true';
    const pauseStartedAt = parseInt(settings.pauseStartedAt || '0', 10) || 0;
    let eventStartedAt = parseInt(settings.eventStartedAt || '0', 10) || 0;

    let shouldPause = false;
    let shouldResume = false;

    if (action === 'start') {
      if (eventStartedAt === 0) {
        eventStartedAt = now;
        await ds.setSetting('eventStartedAt', String(now));
      }
      if (isPaused) shouldResume = true;
    } else if (action === 'pause' || action === 'stop') {
      shouldPause = !isPaused;
    } else if (action === 'resume') {
      shouldResume = isPaused;
    } else if (action === 'toggle') {
      if (isPaused) shouldResume = true;
      else shouldPause = true;
    } else if (action === 'reset') {
      await ds.setSetting('eventStartedAt', String(now));
      await ds.setSetting('totalPausedMs', '0');
      await ds.setSetting('clockPaused', 'false');
      await ds.setSetting('pauseStartedAt', '0');
      await ds.updateEventState({ startedAt: now, totalPausedMs: 0, isPaused: 0, pausedAt: null });
      queryCache.delete('admin_overview');
      return res.json({ success: true, isPaused: false, eventStartedAt: now });
    }

    if (shouldPause) {
      await ds.setSetting('clockPaused', 'true');
      await ds.setSetting('pauseStartedAt', String(now));
      await ds.updateEventState({ isPaused: 1, pausedAt: now });
      queryCache.delete('admin_overview');
      return res.json({ success: true, isPaused: true, eventStartedAt });
    } else if (shouldResume) {
      const duration = pauseStartedAt > 0 ? (now - pauseStartedAt) : 0;

      // Add paused duration to all active teams
      await ds.addPausedMsToActiveTeams(duration);

      // Update global totalPausedMs
      const prevTotal = parseInt(settings.totalPausedMs || '0', 10) || 0;
      const newTotal = prevTotal + duration;
      await ds.setSetting('totalPausedMs', String(newTotal));
      await ds.setSetting('clockPaused', 'false');
      await ds.setSetting('pauseStartedAt', '0');
      await ds.updateEventState({ isPaused: 0, pausedAt: null, totalPausedMs: newTotal });
      queryCache.delete('admin_overview');
      return res.json({ success: true, isPaused: false, eventStartedAt });
    }

    return res.json({ success: true, isPaused, eventStartedAt });
  } catch (err) {
    console.error('Admin clock error:', err);
    return res.status(500).json({ error: 'Failed to update clock.' });
  }
});

// POST /api/admin/settings - Update settings like allowNewTeams or startTogetherMode
router.post('/settings', requireAdmin, async (req, res) => {
  try {
    const { allowNewTeams, startTogetherMode } = req.body;
    if (typeof allowNewTeams === 'boolean') {
      await ds.setSetting('allowNewTeams', allowNewTeams ? 'true' : 'false');
    }
    if (typeof startTogetherMode === 'boolean') {
      await ds.setSetting('startTogetherMode', startTogetherMode ? 'true' : 'false');
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// POST /api/admin/coordinator - Rename/assign coordinator
router.post('/coordinator', requireAdmin, async (req, res) => {
  try {
    const { teamId, coordinator } = req.body;
    if (!teamId || !coordinator) return res.status(400).json({ error: 'Missing teamId or coordinator' });
    await ds.updateTeam(teamId, { coordinator: coordinator.trim() });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update coordinator.' });
  }
});

// GET /api/admin/warden-logs - View WARDEN chat logs
router.get('/warden-logs', requireAdmin, async (req, res) => {
  try {
    const logs = await ds.getRecentWardenLogs(100);
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get warden logs.' });
  }
});

// GET /api/admin/export, /api/admin/export.csv, /api/admin/export.json
const handleExport = async (req, res, format = 'csv') => {
  try {
    const teams = await ds.getAllTeams();
    teams.sort((a, b) => a.startedAt - b.startedAt);

    const teamIds = teams.map(t => t.id);
    const allMembers = await ds.getMembersForTeams(teamIds);
    const allProgress = await ds.getProgressForTeams(teamIds);

    const membersByTeam = {};
    allMembers.forEach(m => {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
      membersByTeam[m.teamId].push(m);
    });

    const progressByTeam = {};
    allProgress.forEach(p => {
      if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
      progressByTeam[p.teamId].push(p);
    });

    const now = Date.now();

    if (format === 'json') {
      const data = teams.map(t => {
        const members = (membersByTeam[t.id] || []).map(m => m.fullName);
        const progress = progressByTeam[t.id] || [];
        const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
        const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

        let effectiveElapsedMs = t.finishedAt ? (t.finishedAt - t.startedAt - (t.pausedMs || 0)) : (now - t.startedAt - (t.pausedMs || 0));
        if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;
        const totalSecs = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
        const timeStr = `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`;

        let vCode = '';
        if (t.finishedAt) {
          vCode = generateVerificationCode(t.name, t.startedAt, t.finishedAt);
        }

        return {
          teamId: t.id,
          teamName: t.name,
          coordinator: t.coordinator,
          members,
          stageReached: t.finishedAt ? 6 : t.stage,
          status: t.finishedAt ? 'Completed' : (t.status === 'waiting' ? 'Waiting in Lobby' : (t.isPaused ? 'Paused' : 'In Progress')),
          startedAt: t.startedAt,
          finishedAt: t.finishedAt,
          elapsedSeconds: totalSecs,
          formattedTime: timeStr,
          penalties: t.penaltyMin,
          tabSwitches: t.tabSwitches || 0,
          hintsUsed: totalHints,
          wrongAttempts: totalWrong,
          verificationCode: vCode
        };
      });
      return res.json({ teams: data });
    }

    const rows = [
      ['Team Name', 'Coordinator', 'Members', 'Stage', 'Status', 'Started At', 'Finished At', 'Total Time (mm:ss)', 'Penalty (min)', 'Tab Switches', 'Hints Used', 'Wrong Attempts', 'Verification Code']
    ];

    teams.forEach(t => {
      const members = (membersByTeam[t.id] || []).map(m => m.fullName).join('; ');
      const progress = progressByTeam[t.id] || [];
      const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

      let effectiveElapsedMs = t.finishedAt ? (t.finishedAt - t.startedAt - (t.pausedMs || 0)) : (now - t.startedAt - (t.pausedMs || 0));
      if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;
      const totalSecs = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
      const timeStr = `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`;

      let vCode = '';
      if (t.finishedAt) {
        vCode = generateVerificationCode(t.name, t.startedAt, t.finishedAt);
      }

      rows.push([
        `"${t.name.replace(/"/g, '""')}"`,
        `"${t.coordinator.replace(/"/g, '""')}"`,
        `"${members.replace(/"/g, '""')}"`,
        t.finishedAt ? '6/6 (Done)' : `${t.stage}/6`,
        t.finishedAt ? 'Completed' : (t.status === 'waiting' ? 'Waiting in Lobby' : (t.isPaused ? 'Paused' : 'In Progress')),
        new Date(t.startedAt).toISOString(),
        t.finishedAt ? new Date(t.finishedAt).toISOString() : 'N/A',
        `"${timeStr}"`,
        t.penaltyMin,
        t.tabSwitches || 0,
        totalHints,
        totalWrong,
        `"${vCode}"`
      ]);
    });

    const csv = rows.map(r => r.join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="final_override_results.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Failed to export data.' });
  }
};

// GET /api/admin/hints - Central hint configurations and policies
router.get('/hints', requireAdmin, async (req, res) => {
  try {
    const hints = await ds.getAllHintConfigs();
    const policies = typeof ds.getAllHintPolicies === 'function' ? await ds.getAllHintPolicies() : [];
    return res.json({ hints, policies });
  } catch (err) {
    console.error('Admin get hints error:', err);
    return res.status(500).json({ error: 'Failed to retrieve hint configurations.' });
  }
});

// GET /api/admin/hint-policies - Dedicated hint policies
router.get('/hint-policies', requireAdmin, async (req, res) => {
  try {
    const policies = typeof ds.getAllHintPolicies === 'function' ? await ds.getAllHintPolicies() : [];
    return res.json({ policies });
  } catch (err) {
    console.error('Admin get hint policies error:', err);
    return res.status(500).json({ error: 'Failed to retrieve hint policies.' });
  }
});

// PUT /api/admin/hint-policies/:stage - Update policy for a stage
router.put('/hint-policies/:stage', requireAdmin, async (req, res) => {
  try {
    const stage = parseInt(req.params.stage, 10);
    if (!stage || stage < 1 || stage > 6) {
      return res.status(400).json({ error: 'Invalid stage number.' });
    }
    const { enabled, costScheduleMinutes, displaySeconds, maxUses } = req.body;
    const updates = {};
    if (enabled !== undefined) updates.enabled = Boolean(enabled);
    if (costScheduleMinutes !== undefined) {
      let parsed = costScheduleMinutes;
      if (typeof costScheduleMinutes === 'string') {
        parsed = costScheduleMinutes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      }
      updates.costScheduleMinutes = parsed;
    }
    if (displaySeconds !== undefined) updates.displaySeconds = parseInt(displaySeconds, 10);
    if (maxUses !== undefined) updates.maxUses = maxUses === null || maxUses === '' ? null : parseInt(maxUses, 10);

    await ds.updateHintPolicy(stage, updates);
    await ds.addAuditLog('admin', 'UPDATE_HINT_POLICY', JSON.stringify({ stage, updates }));
    return res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Admin update hint policy error:', err);
    return res.status(500).json({ error: 'Failed to update hint policy.' });
  }
});

// PUT /api/admin/hints/:id - Update hint configuration or policy
router.put('/hints/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'stage_1_policy' || id === 'h1_policy' || id === 'policy_1') {
      const { enabled, costScheduleMinutes, displayDurationSeconds, displaySeconds } = req.body;
      const updates = {};
      if (enabled !== undefined) updates.enabled = Boolean(enabled);
      if (costScheduleMinutes !== undefined) {
        let parsed = costScheduleMinutes;
        if (typeof costScheduleMinutes === 'string') {
          parsed = costScheduleMinutes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        }
        updates.costScheduleMinutes = parsed;
      }
      const dur = displaySeconds !== undefined ? displaySeconds : displayDurationSeconds;
      if (dur !== undefined) updates.displaySeconds = parseInt(dur, 10);

      await ds.updateHintPolicy(1, updates);
      await ds.addAuditLog('admin', 'UPDATE_HINT_POLICY', JSON.stringify({ stage: 1, updates }));
      return res.json({ success: true, updated: updates });
    }

    const { enabled, text, penaltyMinutes, displayDurationSeconds, category } = req.body;
    const updates = {};
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
    if (text !== undefined) updates.text = String(text);
    if (penaltyMinutes !== undefined) updates.penaltyMinutes = parseInt(penaltyMinutes, 10);
    if (displayDurationSeconds !== undefined) updates.displayDurationSeconds = parseInt(displayDurationSeconds, 10);
    if (category !== undefined) updates.category = String(category);

    await ds.updateHintConfig(id, updates);
    await ds.addAuditLog('admin', 'UPDATE_HINT_CONFIG', JSON.stringify({ id, updates }));

    return res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Admin update hint error:', err);
    return res.status(500).json({ error: 'Failed to update hint configuration.' });
  }
});

router.get('/export', requireAdmin, (req, res) => handleExport(req, res, 'csv'));
router.get('/export.csv', requireAdmin, (req, res) => handleExport(req, res, 'csv'));
router.get('/export.json', requireAdmin, (req, res) => handleExport(req, res, 'json'));

module.exports = router;