// FINAL OVERRIDE — Idempotency Middleware
// Intercepts answer submissions and hint unlocks to guarantee that identical repeated requests
// (e.g. from network retries or rapid double-clicks) do not double-advance stages or double-charge penalties.

const idempotencyStore = new Map(); // key -> { status, body, timestamp }

// Periodic cleanup of keys older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of idempotencyStore.entries()) {
    if (now - record.timestamp > 15 * 60 * 1000) {
      idempotencyStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (!key) return next();

  const teamId = (req.team && req.team.id) || req.body.teamName || 'anonymous';
  const compositeKey = `${teamId}:${req.path}:${key}`;

  if (idempotencyStore.has(compositeKey)) {
    const cached = idempotencyStore.get(compositeKey);
    res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT');
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache successful or intentional 4xx responses, not transient 5xx errors
    if (res.statusCode < 500) {
      idempotencyStore.set(compositeKey, {
        status: res.statusCode,
        body,
        timestamp: Date.now()
      });
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyMiddleware;
