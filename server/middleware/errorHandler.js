// FINAL OVERRIDE — Central Structured Error Handling Middleware
const crypto = require('crypto');

function errorHandler(err, req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const statusCode = err.status || err.statusCode || 500;

  const logPayload = {
    level: statusCode >= 500 ? 'ERROR' : 'WARN',
    requestId,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    statusCode,
    message: err.message,
    teamId: req.team ? req.team.id : null,
    ip: req.ip
  };

  if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
    logPayload.stack = err.stack;
  }

  console.error(JSON.stringify(logPayload));

  res.setHeader('X-Request-Id', requestId);
  return res.status(statusCode).json({
    error: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected mission system error occurred.'
      : (err.message || 'Server error.'),
    requestId
  });
}

module.exports = errorHandler;
