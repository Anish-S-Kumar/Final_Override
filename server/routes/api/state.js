const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ds = require('../../dataService');
const { generateVerificationCode } = require('../../logic/security');
const { STAGE_CONFIG } = require('../../logic/stages');
const { getMemberShard } = require('../../logic/shard');
const { generateStage1Chart, generateStage1Sectors } = require('../../logic/stage1Randomizer');
const { requireTeam } = require('./middleware');
const { queryCache } = require('../../services/queryCache');
const { getNow } = require('../../services/clock');

// GET /api/health - Health check endpoint
router.get('/health', (req, res) => {
  return res.json({ ok: true, time: getNow(req) });
});

// GET /api/state - Current game state
router.get('/state', requireTeam, async (req, res) => {
  try {
    const teamId = req.team.id;
    const now = getNow(req);

    // Check cached full payload (skip cache when mock clock header is present)
    const hasMockClock = Boolean(req.headers['x-mock-now'] || req.headers['x-test-clock']);
    const cacheKey = `team_state_${teamId}`;
    let cachedPayload = hasMockClock ? null : queryCache.get(cacheKey);

    if (cachedPayload) {
      if (req.headers['if-none-match'] === cachedPayload.version || req.query.v === cachedPayload.version) {
        return res.status(200).json({ notModified: true, version: cachedPayload.version, serverTime: now });
      }
      return res.json({ ...cachedPayload, serverTime: now });
    }

    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(401).json({ error: 'Team not found' });
    const currentStage = team.stage;

    // Global settings with 2s cache
    let settings = queryCache.get('global_settings');
    if (!settings) {
      settings = await ds.getAllSettings();
      queryCache.set('global_settings', settings, 2000);
    }

    const isClockPaused = settings.clockPaused === 'true';
    const isGameStarted = settings.gameStarted === 'true';
    const allowNewTeams = settings.allowNewTeams === 'true';
    const isIndividuallyPaused = team.isPaused === 1;
    const isPaused = isClockPaused || isIndividuallyPaused;

    // Waiting count with 2s cache
    let waitingCount = queryCache.get('waiting_count');
    if (waitingCount === null) {
      waitingCount = await ds.getWaitingTeamsCount();
      queryCache.set('waiting_count', waitingCount, 2000);
    }

    // Get solved fragments from progress
    const progressRows = await ds.getProgress(team.id);
    const notebook = {};
    progressRows.forEach(row => {
      if (row.fragment) {
        notebook[row.stage] = row.fragment;
      }
    });

    const currentProg = progressRows.find(row => row.stage === currentStage) || { wrongAttempts: 0, hintsUsed: 0 };

    // Get revealed hints
    const stageConfig = STAGE_CONFIG[currentStage];
    const revealedHints = [];
    if (stageConfig && stageConfig.hints) {
      for (let i = 0; i < currentProg.hintsUsed; i++) {
        revealedHints.push(stageConfig.hints[i]);
      }
    }

    const members = await ds.getMembers(team.id);
    const totalMembers = team.memberCount || members.length;
    const joinedMembers = members.filter(m => m.deviceToken !== null);
    const joinedCount = joinedMembers.length;

    const leaderMember = members.find(m => m.isLeader === 1);
    const leaderShard = leaderMember
      ? (leaderMember.assignedCode || getMemberShard(team.name, leaderMember.fullName, leaderMember.codeType || 'mixed'))
      : null;

    // Build stage-specific payload (ISOLATION ENFORCED: future stage details are never returned)
    let stageContent = null;
    if (team.finishedAt || team.status === 'waiting') {
      // Waiting or Finished
    } else if (currentStage === 1) {
      const memoriseSec = stageConfig.memoriseSeconds || 300;
      const memoriseMs = memoriseSec * 1000;
      const stage1OpensAt = team.stage1OpensAt != null ? team.stage1OpensAt : (team.stage1EnteredAt ? team.stage1EnteredAt + memoriseMs : team.startedAt + memoriseMs);
      const remainingLockMs = Math.max(0, stage1OpensAt - now);
      const isMemorise = now < stage1OpensAt;

      const teamChart = generateStage1Chart(team.seed || team.id || team.name);
      const teamSectors = generateStage1Sectors(teamChart, stageConfig.answer || 'NOVA');

      const hintUsages = await ds.getHintUsage(team.id, 1);
      const activeHint = hintUsages.find(h => h.visibleUntil > now);
      const hintChartActive = !!activeHint;

      const hintPolicy = (typeof ds.getHintPolicy === 'function') ? (await ds.getHintPolicy(1)) : null;
      const costSchedule = hintPolicy?.costScheduleMinutes || [3, 5];
      const totalUses = hintUsages.length;
      const nextCostMinutes = costSchedule[Math.min(totalUses, costSchedule.length - 1)] || 5;

      if (isMemorise) {
        // Phase 1: MEMORISE (300s)
        // Withhold sector data completely from API response
        stageContent = {
          phase: 'memorise',
          title: stageConfig.title || 'Stage 1: Signal Intercept & Morse Matrix',
          memoriseSeconds: memoriseSec,
          memorise: stageConfig.memorise || {
            title: 'PHASE 1: MEMORISE THE CODE',
            text: `MEMORISE THE CODE. You have ${Math.round(memoriseSec / 60)} minutes. The chart will close, and the mission starts when the timer ends. You will need these letters and their patterns to decode the four sectors. Take note of the patterns now.`,
            guidelines: [
              'Study the pattern for each letter carefully.',
              'Group the letters that look alike or share complementary rhythms.',
              'Learn to match patterns quickly under pressure.'
            ]
          },
          chart: teamChart,
          morseChart: teamChart,
          opensAt: stage1OpensAt,
          stage1OpensAt,
          lockRemainingMs: remainingLockMs,
          chartVisibleUntil: stage1OpensAt,
          hintActive: false,
          hints: [],
          nextCostMinutes: costSchedule[0] || 3,
          hintsUsed: 0,
          serverNow: now
        };
      } else {
        // Phase 2: SOLVE (after 300s)
        // Sector data revealed, morse chart withheld unless unlocked via 30s hint
        const chartVisible = hintChartActive;
        const chartVisibleUntil = hintChartActive ? activeHint.visibleUntil : 0;
        stageContent = {
          phase: 'solve',
          title: stageConfig.title || 'Stage 1: Signal Intercept & Morse Matrix',
          memoriseSeconds: memoriseSec,
          intro: stageConfig.intro,
          sectors: teamSectors,
          chart: chartVisible ? teamChart : null,
          morseChart: chartVisible ? teamChart : null,
          hintActive: Boolean(chartVisible),
          opensAt: stage1OpensAt,
          stage1OpensAt,
          lockRemainingMs: 0,
          chartVisibleUntil,
          hints: [], // Empty array for Stage 1: never leak old text hints
          nextCostMinutes,
          hintsUsed: totalUses,
          displaySeconds: hintPolicy?.displaySeconds || 30,
          serverNow: now
        };
      }
    } else if (currentStage === 2) {
      const teamSeq = await ds.getTeamSequence(team.id);
      const workbench = await ds.getStage2Workbench(team.id);
      stageContent = {
        title: stageConfig.title || 'Stage 2: Layered Cryptanalysis & Sequence Assembly',
        encodedText: stageConfig.encodedText,
        payload: stageConfig.encodedText,
        modules: stageConfig.modules || [],
        howToPlay: stageConfig.howToPlay || [],
        vigenere: { mode: 'module-index-sequence', maxLength: 12 },
        parts: stageConfig.fragments || [],
        fragments: teamSeq ? teamSeq.fragmentOrder : (stageConfig.fragments || []).map(f => f.id),
        baseFragments: stageConfig.fragments || [],
        workbench,
        hints: revealedHints
      };
    } else if (currentStage === 3) {
      stageContent = {
        title: stageConfig.title || 'Stage 3: Neural Warden Comms Protocol',
        aiActive: true,
        hints: revealedHints
      };
    } else if (currentStage === 4) {
      stageContent = {
        title: stageConfig.title || 'Stage 4: Capture The Flag & Terminal Infiltration',
        commentToken: stageConfig.commentToken,
        briefing: stageConfig.briefing,
        hints: revealedHints
      };
    } else if (currentStage === 5) {
      stageContent = {
        title: stageConfig.title || 'Stage 5: Team Sync & Multi-Device HMAC Link',
        joinedCount,
        totalMembers,
        leaderShard,
        members: members.map(m => ({ fullName: m.fullName, joined: m.deviceToken !== null, isLeader: !!m.isLeader })),
        hints: revealedHints
      };
    } else if (currentStage === 6) {
      stageContent = {
        title: stageConfig.title || 'Stage 6: Final Integration & Master Override',
        machineNames: stageConfig.machineNames || [],
        notebook,
        hints: revealedHints
      };
    }

    let verificationCode = null;
    if (team.finishedAt) {
      verificationCode = generateVerificationCode(team.name, team.startedAt, team.finishedAt);
    }

    const payload = {
      team: {
        id: team.id,
        name: team.name,
        coordinator: team.coordinator,
        startedAt: team.startedAt,
        finishedAt: team.finishedAt,
        stage: team.stage,
        penaltyMin: team.penaltyMin,
        pausedMs: team.pausedMs,
        status: team.status,
        isPaused: isPaused,
        isIndividuallyPaused,
        isClockPaused,
        tabSwitches: team.tabSwitches || 0,
        memberCount: totalMembers
      },
      gameStarted: isGameStarted,
      waitingInLobby: team.status === 'waiting',
      waitingCount,
      members: members.map(m => ({ fullName: m.fullName, isLeader: !!m.isLeader })),
      currentProg: {
        wrongAttempts: currentProg.wrongAttempts,
        hintsUsed: currentProg.hintsUsed
      },
      revealedHints,
      notebook,
      stageContent,
      serverTime: now,
      verificationCode,
      allowNewTeams
    };

    const stateSig = `${team.stage}-${team.status}-${team.penaltyMin}-${team.pausedMs}-${isPaused}-${currentProg.hintsUsed}-${currentProg.wrongAttempts}-${joinedCount}-${JSON.stringify(notebook)}-${isGameStarted}-${waitingCount}-${allowNewTeams}-${stageContent?.morseChart ? 1 : 0}`;
    const version = crypto.createHash('md5').update(stateSig).digest('hex').slice(0, 12);
    payload.version = version;

    // Cache the payload for 2 seconds
    queryCache.set(cacheKey, payload, 2000);

    if (req.headers['if-none-match'] === version || req.query.v === version) {
      return res.status(200).json({ notModified: true, version, serverTime: now });
    }

    res.setHeader('ETag', version);
    return res.json(payload);
  } catch (err) {
    console.error('State API error:', err);
    return res.status(500).json({ error: 'Failed to retrieve game state.' });
  }
});

module.exports = router;
