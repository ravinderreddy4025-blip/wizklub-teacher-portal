const rateLimit = require('express-rate-limit');
const { isProd } = require('../config/env');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || (isProd ? 15 : 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts, try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_UPLOAD_MAX) || (isProd ? 20 : 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many uploads, slow down.',
});

const apiGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API_MAX) || (isProd ? 400 : 2000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.originalUrl.split('?')[0];
    if (!p.startsWith('/api')) return true;
    if (p === '/api/health') return true;
    return false;
  },
  message: { error: 'Too many requests' },
});

module.exports = {
  loginLimiter,
  uploadLimiter,
  apiGeneralLimiter,
};
