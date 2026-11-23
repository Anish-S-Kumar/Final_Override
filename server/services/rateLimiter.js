// FINAL OVERRIDE — In-Memory Rate Limiting Service
// Configurable sliding window per-team and per-IP rate limiting.

class RateLimiterService {
  constructor() {
    this.windows = new Map(); // key -> [timestamps]
    // Clean up expired buckets every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  isAllowed(key, maxRequests, windowMs) {
    if (process.env.NODE_ENV === 'test') {
      return { allowed: true, retryAfter: 0 };
    }

    const now = Date.now();
    const timestamps = this.windows.get(key) || [];
    const valid = timestamps.filter(t => now - t < windowMs);

    if (valid.length >= maxRequests) {
      const oldest = valid[0];
      const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000);
      this.windows.set(key, valid);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    valid.push(now);
    this.windows.set(key, valid);
    return { allowed: true, retryAfter: 0 };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.windows.entries()) {
      const valid = timestamps.filter(t => now - t < 60 * 60 * 1000);
      if (valid.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, valid);
      }
    }
  }

  reset(key) {
    if (key) this.windows.delete(key);
    else this.windows.clear();
  }
}

module.exports = new RateLimiterService();
