// FINAL OVERRIDE — High Performance In-Memory Cache Service
// Used for caching public leaderboard, admin overviews, and static mission objects.

class CacheService {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds = 2) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }

  invalidate(prefix) {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
  }
}

module.exports = new CacheService();
