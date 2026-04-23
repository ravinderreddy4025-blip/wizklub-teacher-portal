const {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  ACTIVE_ROLE_HEADER,
  cookieSecure,
} = require('../config/env');

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: cookieSecure,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

function clearAuthCookieOpts() {
  return { path: '/', httpOnly: true, secure: cookieSecure, sameSite: 'lax', signed: true };
}

function hasPmoCookie(req) {
  return req.signedCookies[COOKIE_NAME_PMO] === 'pmo' || req.signedCookies[COOKIE_NAME] === 'pmo';
}

function hasSpeakerCookie(req) {
  return req.signedCookies[COOKIE_NAME_SPEAKER] === 'speaker' || req.signedCookies[COOKIE_NAME] === 'speaker';
}

function resolveAuthRole(req) {
  const want = String(req.get(ACTIVE_ROLE_HEADER) || '').trim().toLowerCase();
  if (want === 'pmo') {
    if (req.signedCookies[COOKIE_NAME_PMO] === 'pmo') return 'pmo';
    if (req.signedCookies[COOKIE_NAME] === 'pmo') return 'pmo';
    return null;
  }
  if (want === 'speaker') {
    if (req.signedCookies[COOKIE_NAME_SPEAKER] === 'speaker') return 'speaker';
    if (req.signedCookies[COOKIE_NAME] === 'speaker') return 'speaker';
    return null;
  }
  const pmo = hasPmoCookie(req);
  const spk = hasSpeakerCookie(req);
  if (pmo && !spk) return 'pmo';
  if (spk && !pmo) return 'speaker';
  return null;
}

function requireAuth(req, res, next) {
  const role = resolveAuthRole(req);
  if (role === 'pmo' || role === 'speaker') {
    req.userRole = role;
    return next();
  }
  if (hasPmoCookie(req) && hasSpeakerCookie(req)) {
    return res.status(401).json({
      error: 'Both roles signed in — send X-PO-Role: pmo or speaker on API requests (refresh the app).',
    });
  }
  return res.sendStatus(401);
}

function requirePmo(req, res, next) {
  if (req.userRole !== 'pmo') return res.sendStatus(403);
  next();
}

module.exports = {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_OPTS,
  clearAuthCookieOpts,
  hasPmoCookie,
  hasSpeakerCookie,
  resolveAuthRole,
  requireAuth,
  requirePmo,
};
