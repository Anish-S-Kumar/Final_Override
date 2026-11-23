// FINAL OVERRIDE — Event Loop Lag Monitor & Load Shedding Middleware
// Protects critical state-writing paths (submissions, hints) during extreme bursts.
// If event-loop lag exceeds 200ms, non-critical background read polls (leaderboard, admin) return 503 with Retry-After.

let currentLagMs = 0;
let lastCheck = Date.now();

setInterval(() => {
  const now = Date.now();
  const delta = now - lastCheck;
  lastCheck = now;
  // Interval is 50ms; any excess beyond 50ms is event loop lag
  currentLagMs = Math.max(0, delta - 50);
}, 50).unref();

function loadShedder(req, res, next) {
  // If lag is within safe limits or in test mode, allow all traffic
  if (currentLagMs < 200 || process.env.NODE_ENV === 'test') {
    return next();
  }

  // Critical mission paths are NEVER shed
  const isCritical = req.path.startsWith('/api/submit') ||
                     req.path.startsWith('/api/hint') ||
                     req.path.startsWith('/api/join') ||
                     req.path.startsWith('/api/teams');

  if (isCritical) {
    return next();
  }

  // Non-critical background reads shed load to allow writers to finish
  res.setHeader('Retry-After', '2');
  return res.status(503).json({
    error: 'System high load. Please retry in 2 seconds.',
    shed: true
  });
}

loadShedder.getLag = () => currentLagMs;

module.exports = loadShedder;
