const ds = require('../../dataService');

async function requireTeam(req, res, next) {
  try {
    const leaderToken = req.cookies.fo_leader_token;
    const memberToken = req.cookies.fo_member_token;

    let team = null;
    if (leaderToken) {
      team = await ds.getTeamByToken(leaderToken);
      if (team) {
        req.isLeader = true;
      }
    }

    if (!team && memberToken) {
      const member = await ds.getMemberByDeviceToken(memberToken);
      if (member) {
        team = await ds.getTeamById(member.teamId);
        req.member = member;
        req.isLeader = Boolean(member.isLeader);
      }
    }

    if (!team) {
      return res.status(401).json({ error: 'No active mission session found.' });
    }

    req.team = team;
    next();
  } catch (err) {
    console.error('requireTeam error:', err);
    return res.status(500).json({ error: 'Session verification failed.' });
  }
}

function containsInvalidChars(str) {
  if (typeof str !== 'string') return false;
  return /[<>\x00-\x1F\x7F]/.test(str);
}

module.exports = {
  requireTeam,
  containsInvalidChars
};
