const {
  PMO_USER,
  PMO_PASS,
  SPEAKER_USER,
  SPEAKER_PASS,
  SALES_ADMIN_USER,
  SALES_ADMIN_PASS,
  ADMIN_USER,
} = require('../config/env');
const {
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
} = require('../middleware/auth');

function getMe(req, res) {
  const role = resolveAuthRole(req);
  if (role === 'pmo' || role === 'speaker' || role === 'sales_admin') return res.json({ role });
  const pmo = hasPmoCookie(req);
  const spk = hasSpeakerCookie(req);
  const sales = hasSalesAdminCookie(req);
  const count = (pmo ? 1 : 0) + (spk ? 1 : 0) + (sales ? 1 : 0);
  if (count > 1) {
    return res.status(401).json({
      role: null,
      error:
        'Multiple roles signed in — this tab must send header X-PO-Role: pmo, speaker, or sales_admin.',
    });
  }
  return res.status(401).json({ role: null });
}

function login(req, res) {
  const user = (req.body && req.body.user ? String(req.body.user) : '').trim();
  const pass = req.body && req.body.pass != null ? String(req.body.pass) : '';
  let role = null;
  if (user === PMO_USER && pass === PMO_PASS) role = 'pmo';
  else if (ADMIN_USER && user.toLowerCase() === ADMIN_USER && pass === PMO_PASS) role = 'pmo';
  else if (user === SPEAKER_USER && pass === SPEAKER_PASS) role = 'speaker';
  else if (user === SALES_ADMIN_USER && pass === SALES_ADMIN_PASS) role = 'sales_admin';
  if (!role) return res.status(401).json({ ok: false });

  res.clearCookie(COOKIE_NAME, clearAuthCookieOpts());
  if (role === 'pmo') res.cookie(COOKIE_NAME_PMO, 'pmo', { ...COOKIE_OPTS, signed: true });
  else if (role === 'speaker') {
    res.cookie(COOKIE_NAME_SPEAKER, 'speaker', { ...COOKIE_OPTS, signed: true });
  } else {
    res.cookie(COOKIE_NAME_SALES_ADMIN, 'sales_admin', { ...COOKIE_OPTS, signed: true });
  }
  return res.json({ ok: true, role });
}

function logout(req, res) {
  const bodyRole =
    req.body && req.body.role != null ? String(req.body.role).trim().toLowerCase() : '';
  const c = clearAuthCookieOpts();
  if (bodyRole === 'pmo') res.clearCookie(COOKIE_NAME_PMO, c);
  else if (bodyRole === 'speaker') res.clearCookie(COOKIE_NAME_SPEAKER, c);
  else if (bodyRole === 'sales_admin') res.clearCookie(COOKIE_NAME_SALES_ADMIN, c);
  else {
    res.clearCookie(COOKIE_NAME_PMO, c);
    res.clearCookie(COOKIE_NAME_SPEAKER, c);
    res.clearCookie(COOKIE_NAME_SALES_ADMIN, c);
    res.clearCookie(COOKIE_NAME, c);
  }
  return res.json({ ok: true });
}

module.exports = { getMe, login, logout };

