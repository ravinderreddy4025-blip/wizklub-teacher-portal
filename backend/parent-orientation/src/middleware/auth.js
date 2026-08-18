const {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_NAME_SALES_ADMIN,
  COOKIE_NAME_SUPERADMIN,
  ACTIVE_ROLE_HEADER,
  cookieSecure,
  ADMIN_USER,
  SUPERADMIN_PASS,
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

function parseRoleCookie(val, expectedRole) {
  if (!val || typeof val !== 'string') return null;
  if (val === expectedRole) return { role: expectedRole, username: expectedRole };
  const parts = val.split('|');
  if (parts[0] === expectedRole && parts[1]) return { role: expectedRole, username: parts[1] };
  return null;
}

function sanitizeCookieUsername(username) {
  return String(username || '')
    .replace(/[|\r\n\t]/g, '')
    .slice(0, 80);
}

function roleCookieValue(role, username) {
  const safe = sanitizeCookieUsername(username) || role;
  return `${role}|${safe}`;
}

function hasSuperAdminCookie(req) {
  return Boolean(parseRoleCookie(req.signedCookies[COOKIE_NAME_SUPERADMIN], 'superadmin'));
}

function hasPmoCookie(req) {
  return (
    parseRoleCookie(req.signedCookies[COOKIE_NAME_PMO], 'pmo') ||
    req.signedCookies[COOKIE_NAME] === 'pmo' ||
    parseRoleCookie(req.signedCookies[COOKIE_NAME], 'pmo')
  );
}

function hasSpeakerCookie(req) {
  return (
    parseRoleCookie(req.signedCookies[COOKIE_NAME_SPEAKER], 'speaker') ||
    req.signedCookies[COOKIE_NAME] === 'speaker' ||
    parseRoleCookie(req.signedCookies[COOKIE_NAME], 'speaker')
  );
}

function hasSalesAdminCookie(req) {
  return Boolean(parseRoleCookie(req.signedCookies[COOKIE_NAME_SALES_ADMIN], 'sales_admin'));
}

function isSuperAdminCredentials(user, pass) {
  const u = String(user || '').trim().toLowerCase();
  return Boolean(ADMIN_USER && u === ADMIN_USER && String(pass) === String(SUPERADMIN_PASS));
}

function resolveAuthRole(req) {
  const wantHeader = String(req.get(ACTIVE_ROLE_HEADER) || '').trim().toLowerCase();
  const wantQuery = String((req.query && req.query.role) || '').trim().toLowerCase();
  const want = wantHeader || wantQuery;

  const superAPresent = hasSuperAdminCookie(req);
  const pmoPresent = hasPmoCookie(req);
  const speakerPresent = hasSpeakerCookie(req);
  const salesPresent = hasSalesAdminCookie(req);
  const presentCount =
    (superAPresent ? 1 : 0) + (pmoPresent ? 1 : 0) + (speakerPresent ? 1 : 0) + (salesPresent ? 1 : 0);
  if (!want && presentCount > 1) return null;

  function readRole(kind, hasFn, cookieName, legacyCookie) {
    if (want && want !== kind) return null;
    const parsed =
      parseRoleCookie(req.signedCookies[cookieName], kind) ||
      (legacyCookie ? parseRoleCookie(req.signedCookies[legacyCookie], kind) : null) ||
      (legacyCookie && req.signedCookies[legacyCookie] === kind
        ? { role: kind, username: kind }
        : null);
    if (parsed) {
      req.authUser = { username: parsed.username, role: kind, source: kind === 'superadmin' ? 'env' : 'session' };
      return kind;
    }
    return undefined;
  }

  const forced =
    readRole('superadmin', hasSuperAdminCookie, COOKIE_NAME_SUPERADMIN) ??
    readRole('pmo', hasPmoCookie, COOKIE_NAME_PMO, COOKIE_NAME) ??
    readRole('speaker', hasSpeakerCookie, COOKIE_NAME_SPEAKER, COOKIE_NAME) ??
    readRole('sales_admin', hasSalesAdminCookie, COOKIE_NAME_SALES_ADMIN);
  if (forced) return forced;

  const superA = hasSuperAdminCookie(req);
  const pmo = hasPmoCookie(req);
  const spk = hasSpeakerCookie(req);
  const sales = hasSalesAdminCookie(req);
  const count = (superA ? 1 : 0) + (pmo ? 1 : 0) + (spk ? 1 : 0) + (sales ? 1 : 0);
  if (count > 1) return null;
  if (superA) {
    const p = parseRoleCookie(req.signedCookies[COOKIE_NAME_SUPERADMIN], 'superadmin');
    req.authUser = { username: p?.username || ADMIN_USER, role: 'superadmin', source: 'env' };
    return 'superadmin';
  }
  if (pmo) {
    const p =
      parseRoleCookie(req.signedCookies[COOKIE_NAME_PMO], 'pmo') ||
      parseRoleCookie(req.signedCookies[COOKIE_NAME], 'pmo') ||
      { username: 'pmo', role: 'pmo' };
    req.authUser = { username: p.username, role: 'pmo', source: 'session' };
    return 'pmo';
  }
  if (spk) {
    const p =
      parseRoleCookie(req.signedCookies[COOKIE_NAME_SPEAKER], 'speaker') ||
      parseRoleCookie(req.signedCookies[COOKIE_NAME], 'speaker') ||
      { username: 'speaker', role: 'speaker' };
    req.authUser = { username: p.username, role: 'speaker', source: 'session' };
    return 'speaker';
  }
  if (sales) {
    const p = parseRoleCookie(req.signedCookies[COOKIE_NAME_SALES_ADMIN], 'sales_admin') || {
      username: 'sales_admin',
      role: 'sales_admin',
    };
    req.authUser = { username: p.username, role: 'sales_admin', source: 'session' };
    return 'sales_admin';
  }
  return null;
}

function attachAuthUser(req) {
  const role = req.userRole;
  if (role === 'superadmin') {
    if (!req.authUser?.username) {
      req.authUser = { username: ADMIN_USER, role: 'superadmin', source: 'env' };
    }
    return;
  }
  if (req.authUser) return;
  if (role) req.authUser = { username: role, role, source: 'session' };
}

function requireAuth(req, res, next) {
  const role = resolveAuthRole(req);
  if (role === 'superadmin' || role === 'pmo' || role === 'speaker' || role === 'sales_admin') {
    req.userRole = role;
    attachAuthUser(req);
    return next();
  }
  const superA = hasSuperAdminCookie(req);
  const pmo = hasPmoCookie(req);
  const spk = hasSpeakerCookie(req);
  const sales = hasSalesAdminCookie(req);
  const count = (superA ? 1 : 0) + (pmo ? 1 : 0) + (spk ? 1 : 0) + (sales ? 1 : 0);
  if (count > 1) {
    return res.status(401).json({
      error:
        'Multiple roles signed in — send X-PO-Role: superadmin, pmo, speaker, or sales_admin on API requests.',
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

function requireSuperAdmin(req, res, next) {
  if (req.userRole !== 'superadmin') return res.sendStatus(403);
  next();
}

module.exports = {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_NAME_SALES_ADMIN,
  COOKIE_NAME_SUPERADMIN,
  COOKIE_OPTS,
  clearAuthCookieOpts,
  hasSuperAdminCookie,
  hasPmoCookie,
  hasSpeakerCookie,
  hasSalesAdminCookie,
  isSuperAdminCredentials,
  resolveAuthRole,
  requireAuth,
  requirePmo,
  requireSalesAdmin,
  requireSuperAdmin,
  roleCookieValue,
  parseRoleCookie,
  sanitizeCookieUsername,
};
