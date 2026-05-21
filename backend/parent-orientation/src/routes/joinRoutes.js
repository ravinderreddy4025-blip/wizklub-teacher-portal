const express = require('express');
const { joinPostLimiter } = require('../middleware/rateLimiters');
const { getJoinPage, postJoin } = require('../controllers/joinController');

function mountJoinRoutes(app) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "form-action *",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; ')
    );
    next();
  });
  router.use(express.urlencoded({ extended: false, limit: '4kb' }));

  router.get('/:sessionId', getJoinPage);
  router.post('/:sessionId', joinPostLimiter, postJoin);

  app.use('/join', router);
}

module.exports = { mountJoinRoutes };
