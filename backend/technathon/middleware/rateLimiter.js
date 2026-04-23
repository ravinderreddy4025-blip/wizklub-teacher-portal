/**
 * Rate limit presets for login, general API, and uploads.
 * Doc: ../../../docs/file-notes/server/middleware/rateLimiter.js.md
 */
const rateLimit = require('express-rate-limit');

// In test mode — bypass all rate limiting so test suites don't exhaust limits
const isTest = process.env.NODE_ENV === 'test';
const enableRateLimitInTest = process.env.ENABLE_RATE_LIMIT_IN_TEST === 'true';
const passThrough = (_req, _res, next) => next();
const shouldBypassTests = isTest && !enableRateLimitInTest;

// Preprod / load-test bypass — set explicitly on the server (never in public repos)
const disableAllRateLimits = process.env.DISABLE_RATE_LIMIT === 'true';

const parseEnvInt = (key, fallback) => {
  const value = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const shouldBypassAll = shouldBypassTests || disableAllRateLimits;

/**
 * Login rate limiter: max 5 attempts per 15 minutes per IP.
 * Returns JSON error (not HTML) on limit exceeded.
 */
const loginLimiter = shouldBypassAll ? passThrough : rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: parseEnvInt('LOGIN_RATE_LIMIT_MAX', 5),
  standardHeaders: true,      // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  handler: (req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * General API limiter: max 300 requests per minute per IP.
 * Protects submission and export endpoints from abuse.
 */
const apiLimiter = shouldBypassAll ? passThrough : rateLimit({
  windowMs: parseEnvInt('API_RATE_LIMIT_WINDOW_MS', 60 * 1000),  // 1 minute
  max: parseEnvInt('API_RATE_LIMIT_MAX', 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
  handler: (req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * Upload limiter: max 30 uploads per 15 minutes per IP.
 * Helps control unauthenticated upload abuse.
 */
const uploadLimiter = shouldBypassAll ? passThrough : rateLimit({
  windowMs: parseEnvInt('UPLOAD_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 minutes
  max: parseEnvInt('UPLOAD_LIMIT_MAX', 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many upload attempts. Please try again later.',
  },
  handler: (req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});

module.exports = { loginLimiter, apiLimiter, uploadLimiter };
