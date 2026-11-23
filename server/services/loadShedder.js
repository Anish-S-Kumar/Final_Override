// FINAL OVERRIDE — Load Shedding & Health Guard
// Protects against event loop starvation (> 200ms sustained lag)

class LoadShedder {
  constructor(thresholdMs = 200) {
    this.thresholdMs = thresholdMs;
    this.currentLag = 0;
    this.simulatedLag = null;
    this.warmup = 5; // 500ms warmup period to prevent false alarms on process startup
    this.lastCheck = performance.now();
    this._interval = setInterval(() => {
      const now = performance.now();
      const actual = now - this.lastCheck;
      this.lastCheck = now;
      if (this.warmup > 0) {
        this.warmup--;
        return;
      }
      const sampleLag = Math.max(0, actual - 100);
      this.currentLag = (this.currentLag * 0.6) + (sampleLag * 0.4);
    }, 100);
    if (this._interval.unref) this._interval.unref();
  }

  getLag() {
    if (this.simulatedLag !== null) return this.simulatedLag;
    return this.currentLag;
  }

  simulateLag(ms) {
    this.simulatedLag = ms;
  }

  resetLag() {
    this.simulatedLag = null;
  }

  middleware() {
    return (req, res, next) => {
      // Allow testing without spurious event loop lag interference unless simulated
      if (process.env.NODE_ENV === 'test' && this.simulatedLag === null) {
        return next();
      }

      // Allow health check and admin endpoints even during load shedding
      if (req.path === '/health' || req.path.startsWith('/admin')) {
        return next();
      }

      if (this.getLag() > this.thresholdMs) {
        return res.status(503).json({
          error: 'SERVER_OVERLOADED',
          message: 'Server is currently experiencing elevated load. Please retry.'
        });
      }
      next();
    };
  }

  close() {
    if (this._interval) clearInterval(this._interval);
  }
}

const loadShedder = new LoadShedder(200);
module.exports = { LoadShedder, loadShedder };
