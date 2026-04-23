const {
  PMO_USER,
  PMO_PASS,
  SPEAKER_USER,
  SPEAKER_PASS,
  ADMIN_USER,
} = require('../config/env');
const {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_OPTS,
  clearAuthCookieOpts,
  hasPmoCookie,
  hasSpeakerCookie,
  resolveAuthRole,
} = require('../middleware/auth');

function getMe(req, res) {
  const role = resolveAuthRole(req);
  if (role === 'pmo' || role === 'speaker') return res.json({ role });
  if (hasPmoCookie(req) && hasSpeakerCookie(req)) {
    return res.status(401).json({
      role: null,
      error: 'Both PMO and Speaker are signed in — this tab must send header X-PO-Role: pmo or speaker.',
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
  if (!role) return res.status(401).json({ ok: false });

  res.clearCookie(COOKIE_NAME, clearAuthCookieOpts());
  if (role === 'pmo') res.cookie(COOKIE_NAME_PMO, 'pmo', { ...COOKIE_OPTS, signed: true });
  else res.cookie(COOKIE_NAME_SPEAKER, 'speaker', { ...COOKIE_OPTS, signed: true });
  return res.json({ ok: true, role });
}

function logout(req, res) {
  const bodyRole =
    req.body && req.body.role != null ? String(req.body.role).trim().toLowerCase() : '';
  const c = clearAuthCookieOpts();
  if (bodyRole === 'pmo') res.clearCookie(COOKIE_NAME_PMO, c);
  else if (bodyRole === 'speaker') res.clearCookie(COOKIE_NAME_SPEAKER, c);
  else {
    res.clearCookie(COOKIE_NAME_PMO, c);
    res.clearCookie(COOKIE_NAME_SPEAKER, c);
    res.clearCookie(COOKIE_NAME, c);
  }
  return res.json({ ok: true });
}

module.exports = { getMe, login, logout };

