const loginAttempts = new Map();

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry) {
    if (now > entry.resetAt) {
      loginAttempts.delete(ip);
      return true;
    }
    if (entry.count >= 5) {
      return false;
    }
  }
  return true;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + 10 * 60 * 1000;
  } else {
    entry.count += 1;
  }
  loginAttempts.set(ip, entry);
}

function resetLoginRateLimit(ip) {
  loginAttempts.delete(ip);
}

module.exports = {
  getClientIp,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit
};
