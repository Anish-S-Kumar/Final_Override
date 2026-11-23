// Injectable clock helper for deterministic time testing and production runtime
function getNow(req) {
  if (req) {
    const mockHdr = req.headers ? (req.headers['x-mock-now'] || req.headers['x-test-clock']) : null;
    if (mockHdr) {
      const parsed = parseInt(mockHdr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return Date.now();
}

module.exports = { getNow };
