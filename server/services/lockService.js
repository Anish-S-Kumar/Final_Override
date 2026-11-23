// FINAL OVERRIDE — Per-Team Async Mutex Lock Service
// Ensures state-changing operations (submissions, hints, joins) for the same team are serialized,
// while allowing requests for different teams to execute concurrently.

class LockService {
  constructor() {
    this.locks = new Map(); // teamId -> Promise
    this.acquire = this.acquire.bind(this);
    this.withLock = this.withLock.bind(this);
  }

  async acquire(teamId, timeoutMs = 8000) {
    if (!teamId) return () => {};

    let resolveLock;
    const lockPromise = new Promise(resolve => { resolveLock = resolve; });

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Lock acquisition timeout for team ${teamId}`));
      }, timeoutMs);
    });

    while (this.locks.has(teamId)) {
      try {
        await Promise.race([this.locks.get(teamId), timeoutPromise]);
      } catch (err) {
        clearTimeout(timeoutHandle);
        throw err;
      }
    }

    clearTimeout(timeoutHandle);
    this.locks.set(teamId, lockPromise);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.locks.delete(teamId);
      resolveLock();
    };
  }

  async withLock(teamId, fn, timeoutMs = 8000) {
    const release = await this.acquire(teamId, timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

module.exports = new LockService();
