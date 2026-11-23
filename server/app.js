const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { loadShedder } = require('./services/loadShedder');

// Initialize database schema
require('./db');

const app = express();

app.use(loadShedder.middleware());
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Disable aggressive browser caching for HTML, CSS and JS
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Serve static assets from public/
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// Mount API routes
app.use('/api', require('./routes/api'));
app.use('/api/warden', require('./routes/wardenRoutes'));
app.use('/api/terminal', require('./routes/terminal'));
app.use('/api/coordinator', require('./routes/coordinator'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

// Public config endpoint - do not leak coordinator names publicly
app.get('/api/config', (req, res) => {
  res.json({
    timeCapMinutes: config.TIME_CAP_MINUTES
  });
});

// SPA fallback for all frontend routes: /, /coordinator, /admin, /leaderboard
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
