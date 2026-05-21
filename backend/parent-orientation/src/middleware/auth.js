const {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_NAME_SALES_ADMIN,
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

function hasSalesAdminCookie(req) {
  return req.signedCookies[COOKIE_NAME_SALES_ADMIN] === 'sales_admin';
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
  if (want === 'sales_admin') {
    if (hasSalesAdminCookie(req)) return 'sales_admin';
    return null;
  }
  const pmo = hasPmoCookie(req);
  const spk = hasSpeakerCookie(req);
  const sales = hasSalesAdminCookie(req);
  const count = (pmo ? 1 : 0) + (spk ? 1 : 0) + (sales ? 1 : 0);
  if (count > 1) return null;
  if (pmo) return 'pmo';
  if (spk) return 'speaker';
  if (sales) return 'sales_admin';
  return null;
}

function requireAuth(req, res, next) {
  const role = resolveAuthRole(req);
  if (role === 'pmo' || role === 'speaker' || role === 'sales_admin') {
    req.userRole = role;
    return next();
  }
  const pmo = hasPmoCookie(req);
  const spk = hasSpeakerCookie(req);
  const sales = hasSalesAdminCookie(req);
  const count = (pmo ? 1 : 0) + (spk ? 1 : 0) + (sales ? 1 : 0);
  if (count > 1) {
    return res.status(401).json({
      error:
        'Multiple roles signed in — send X-PO-Role: pmo, speaker, or sales_admin on API requests (refresh the app).',
    });
  }
  return res.sendStatus(401);
}

function requirePmo(req, res, next) {
  if (req.userRole !== 'pmo') return res.sendStatus(403);
  next();
}

function requireSalesAdmin(req, res, next) {
  if (req.userRole !== 'sales_admin') return res.sendStatus(403);
  next();
}

module.exports = {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_NAME_SALES_ADMIN,
  COOKIE_OPTS,
  clearAuthCookieOpts,
  hasPmoCookie,
  hasSpeakerCookie,
  hasSalesAdminCookie,
  resolveAuthRole,
  requireAuth,
  requirePmo,
  requireSalesAdmin,
};
