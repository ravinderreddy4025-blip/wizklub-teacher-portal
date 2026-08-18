const express = require('express');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const dispatchRoutes = require('./dispatchRoutes');
const schoolRoutes = require('./schoolRoutes');
const amRoutes = require('./amRoutes');
const { getMedia } = require('../controllers/mediaController');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/media/*path', getMedia);

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/dispatch', dispatchRoutes);
router.use('/school', schoolRoutes);
router.use('/am', amRoutes);
router.use('/rm', amRoutes);

module.exports = router;
