const express = require('express');
const router = express.Router();
const ds = require('../../dataService');
const { norm, generateToken } = require('../../logic/security');
const { getMemberShard } = require('../../logic/shard');
const { containsInvalidChars } = require('./middleware');

// POST /api/join - Joining as a team member
router.post('/join', async (req, res) => {
  try {
    const { teamName, fullName } = req.body;

    const rawTeam = (teamName || '').trim();
    const rawName = (fullName || '').trim();

    if (!rawTeam || !rawName) {
      return res.status(400).json({ error: 'Please enter team name and your full name.' });
    }

    if (containsInvalidChars(rawTeam) || containsInvalidChars(rawName)) {
      return res.status(400).json({ error: 'Team name and member name cannot contain <, >, or control characters.' });
    }

    // Find team (case/space-insensitive)
    const allTeams = await ds.getAllTeams();
    const targetTeam = allTeams.find(t => norm(t.name) === norm(rawTeam));
    if (!targetTeam) {
      return res.status(404).json({ error: 'Team not found. Please check the team name.' });
    }

    // Find member in team (case/space-insensitive)
    const teamMembers = await ds.getMembers(targetTeam.id);
    const targetMember = teamMembers.find(m => norm(m.fullName) === norm(rawName));

    if (!targetMember) {
      return res.status(404).json({ error: 'Member name not found in this team. Check exact spelling.' });
    }

    // Refuse if request carries the leader's session cookie and tries to join for another member
    const leaderToken = req.cookies.fo_leader_token;
    if (leaderToken) {
      const leaderTeam = await ds.getTeamByToken(leaderToken);
      if (leaderTeam && leaderTeam.id === targetTeam.id) {
        const leaderMember = teamMembers.find(m => m.isLeader === 1);
        if (!leaderMember || norm(leaderMember.fullName) !== norm(rawName)) {
          return res.status(403).json({
            error: 'This device is running the team. Please use your own laptop to get your shard. 🙂'
          });
        }
      }
    }

    // Device binding check
    let memberToken = req.cookies.fo_member_token;

    if (targetMember.deviceToken) {
      // If already bound, check if current cookie matches
      if (memberToken !== targetMember.deviceToken) {
        return res.status(403).json({
          error: 'This member name is already bound to another device. Contact the admin if you need a reset.'
        });
      }
    } else {
      // If another member has already claimed this browser's device token, prevent re-use
      if (memberToken) {
        const alreadyClaimed = teamMembers.find(m => m.deviceToken === memberToken && m.id !== targetMember.id);
        if (alreadyClaimed) {
          return res.status(403).json({
            error: 'This device is already bound to another team member.'
          });
        }
      } else {
        memberToken = generateToken();
      }

      await ds.updateMember(targetMember.id, { deviceToken: memberToken });
    }

    // Set member cookie
    res.cookie('fo_member_token', memberToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    const memberShard = targetMember.assignedCode || getMemberShard(targetTeam.name, targetMember.fullName, targetMember.codeType || 'mixed');

    return res.json({
      success: true,
      team: targetTeam.name,
      name: targetMember.fullName,
      shard: memberShard
    });
  } catch (err) {
    console.error('Join API error:', err);
    return res.status(500).json({ error: 'Failed to join as team member.' });
  }
});

module.exports = router;
