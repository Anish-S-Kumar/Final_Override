// FINAL OVERRIDE — In-Memory 2-Second Query & State Cache
// Provides micro-caching for high-frequency read paths

class QueryCache {
  constructor(defaultTtlMs = 2000) {
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

const queryCache = new QueryCache(2000);
module.exports = { QueryCache, queryCache };
