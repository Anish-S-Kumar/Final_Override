const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ds = require('../../dataService');
const config = require('../../config');
const mission = require('../../content/mission');
const { norm, generateToken } = require('../../logic/security');
const { assignMemberCodeTypes, getMemberShard } = require('../../logic/shard');
const { generateSequence } = require('../../logic/stage2Randomizer');
const { containsInvalidChars } = require('./middleware');
const { getNow } = require('../../services/clock');

// POST /api/teams - Register team
router.post('/teams', async (req, res) => {
  try {
    const { teamName, coordinator, member1, member2, member3, member4 } = req.body;

    const rawTeamName = (teamName || '').trim();
    const rawCoord = (coordinator || '').trim();

    if (!rawTeamName || !rawCoord) {
      return res.status(400).json({ error: 'Please enter the team name and the event coordinator name.' });
    }

    if (containsInvalidChars(rawTeamName)) {
      return res.status(400).json({ error: 'Team and member names cannot contain <, >, or control characters.' });
    }

    if (rawTeamName.length > 24) {
      return res.status(400).json({ error: 'Team name cannot exceed 24 characters.' });
    }

    // Verify coordinator is valid from configured list if configured
    if (config.COORDINATORS && config.COORDINATORS.length > 0) {
      const validCoord = config.COORDINATORS.find(c => c.toLowerCase() === rawCoord.toLowerCase());
      if (!validCoord) {
        return res.status(400).json({ error: 'Invalid coordinator name selected.' });
      }
    }

    const minTeamSize = config.MIN_TEAM_SIZE || 3;
    const maxTeamSize = config.MAX_TEAM_SIZE || 4;

    const m1 = (member1 || '').trim();
    const m2 = (member2 || '').trim();
    const m3 = (member3 || '').trim();
    const m4 = (member4 || '').trim();

    const rawMembers = [m1, m2, m3].filter(Boolean);
    if (m4) {
      rawMembers.push(m4);
    }
    if (Array.isArray(req.body.members)) {
      rawMembers.length = 0;
      for (const m of req.body.members) {
        const trimmed = (m || '').trim();
        if (trimmed) rawMembers.push(trimmed);
      }
    } else if (req.body.member5 && String(req.body.member5).trim()) {
      rawMembers.push(String(req.body.member5).trim());
    }

    if (rawMembers.length < minTeamSize || rawMembers.length > maxTeamSize) {
      return res.status(400).json({
        error: `A team must have ${minTeamSize} or ${maxTeamSize} players. You entered ${rawMembers.length}.`
      });
    }

    for (const mem of rawMembers) {
      if (containsInvalidChars(mem)) {
        return res.status(400).json({ error: 'Member names cannot contain <, >, or control characters.' });
      }
    }

    // Check unique member names (case-insensitive)
    const normMembers = rawMembers.map(m => norm(m));
    const uniqueNorms = new Set(normMembers);
    if (uniqueNorms.size !== rawMembers.length) {
      return res.status(400).json({ error: 'Each member must have a different name.' });
    }

    // Check duplicate team name (case-insensitive)
    const existing = await ds.getTeamByName(rawTeamName);
    if (existing) {
      return res.status(400).json({ error: 'Team name is already taken. Please choose another name.' });
    }

    const teamId = crypto.randomUUID();
    const sessionToken = generateToken();
    const seed = crypto.randomBytes(16).toString('hex');
    const now = getNow(req);

    // Check start together mode setting
    const startTogetherVal = await ds.getSetting('startTogetherMode', 'true');
    const gameStartedVal = await ds.getSetting('gameStarted', 'false');
    const isStartTogether = startTogetherVal === 'true';
    const isGameStarted = gameStartedVal === 'true';

    const initialStatus = (isStartTogether && !isGameStarted) ? 'waiting' : 'active';

    // Build raw members (Player 1 is leader)
    const membersData = [
      { id: crypto.randomUUID(), teamId, fullName: rawMembers[0], isLeader: 1, deviceToken: null }
    ];
    for (let i = 1; i < rawMembers.length; i++) {
      membersData.push({ id: crypto.randomUUID(), teamId, fullName: rawMembers[i], isLeader: 0, deviceToken: null });
    }

    // Assign mixed and alpha codeTypes and calculate shards using per-team seed
    const typedMembers = assignMemberCodeTypes(membersData, seed);
    const finalMembers = typedMembers.map(m => ({
      ...m,
      assignedCode: getMemberShard(rawTeamName, m.fullName, m.codeType)
    }));

    // Generate Stage 2 deterministic sequence
    const sequence = generateSequence(seed);

    await ds.createTeam({
      team: {
        id: teamId,
        name: rawTeamName,
        coordinator: rawCoord,
        startedAt: now,
        finishedAt: null,
        stage: 1,
        penaltyMin: 0,
        pausedMs: 0,
        sessionToken,
        status: initialStatus,
        isPaused: 0,
        teamPauseStartedAt: 0,
        tabSwitches: 0,
        seed,
        version: 1,
        stage1EnteredAt: now,
        stage1OpensAt: now + ((mission.stage1?.memoriseSeconds || 300) * 1000),
        memberCount: rawMembers.length
      },
      members: finalMembers,
      stages: 6,
      sequence
    });

    res.cookie('fo_leader_token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      teamId,
      memberCount: rawMembers.length,
      team: { id: teamId, name: rawTeamName, memberCount: rawMembers.length },
      sessionToken,
      status: initialStatus
    });
  } catch (err) {
    console.error('Register team error:', err);
    return res.status(500).json({ error: 'Server error during team registration.' });
  }
});

// POST /api/recover-leader - Leader session recovery
router.post('/recover-leader', async (req, res) => {
  try {
    const { teamName, code } = req.body;
    if (!teamName || !code) {
      return res.status(400).json({ error: 'Team name and 6-digit recovery code are required.' });
    }

    const allTeams = await ds.getAllTeams();
    const targetTeam = allTeams.find(t => norm(t.name) === norm(teamName));
    if (!targetTeam) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const recovery = await ds.getLeaderRecovery(targetTeam.id, String(code).trim());
    if (!recovery) {
      return res.status(400).json({ error: 'Invalid or expired recovery code.' });
    }

    // Invalidate code so it is single-use
    await ds.markLeaderRecoveryUsed(targetTeam.id, String(code).trim());

    // Generate new leader session token
    const newSessionToken = generateToken();
    await ds.updateTeam(targetTeam.id, { sessionToken: newSessionToken });

    res.cookie('fo_leader_token', newSessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      teamId: targetTeam.id,
      sessionToken: newSessionToken
    });
  } catch (err) {
    console.error('Recover leader error:', err);
    return res.status(500).json({ error: 'Failed to recover leader session.' });
  }
});

module.exports = router;
