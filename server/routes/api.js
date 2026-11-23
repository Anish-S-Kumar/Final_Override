const express = require('express');
const router = express.Router();

// Mount modular sub-routers
router.use('/', require('./api/registration'));
router.use('/', require('./api/state'));
router.use('/', require('./api/submissions'));
router.use('/', require('./api/hints'));
router.use('/', require('./api/join'));
router.use('/', require('./api/stage2'));

module.exports = router;
