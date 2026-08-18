const { ADMIN_USER } = require('../config/env');

const { findUserByUsername } = require('../models/userModel');

const { verifyPassword } = require('../utils/passwordUtils');

const { recordAudit } = require('../services/auditLog');

const wizklubApi = require('../services/wizklubApiService');

const {

  COOKIE_NAME,

  COOKIE_NAME_PMO,

  COOKIE_NAME_SPEAKER,

  COOKIE_NAME_SALES_ADMIN,

  COOKIE_NAME_SUPERADMIN,

  COOKIE_OPTS,

  clearAuthCookieOpts,

  hasPmoCookie,

  hasSpeakerCookie,

  hasSalesAdminCookie,

  hasSuperAdminCookie,

  isSuperAdminCredentials,

  resolveAuthRole,

  roleCookieValue,

} = require('../middleware/auth');



function getMe(req, res) {

  const role = resolveAuthRole(req);

  if (role === 'superadmin') {

    const username = req.authUser?.username || ADMIN_USER;

    return res.json({ role, username });

  }

  if (role === 'pmo' || role === 'speaker' || role === 'sales_admin') {

    const username = req.authUser?.username || role;

    return res.json({ role, username });

  }

  const superA = hasSuperAdminCookie(req);

  const pmo = hasPmoCookie(req);

  const spk = hasSpeakerCookie(req);

  const sales = hasSalesAdminCookie(req);

  const count = (superA ? 1 : 0) + (pmo ? 1 : 0) + (spk ? 1 : 0) + (sales ? 1 : 0);

  if (count > 1) {

    return res.status(401).json({

      role: null,

      error:

        'Multiple roles signed in — this tab must send header X-PO-Role: superadmin, pmo, speaker, or sales_admin.',

    });

  }

  return res.status(401).json({ role: null });

}



function normalizePortal(portal) {

  const key = String(portal || '').trim().toLowerCase();

  if (key === 'sales-admin') return 'sales_admin';

  return key;

}



async function resolveWizklubPmoLogin(user, pass) {

  const wizklubData = await wizklubApi.staffLogin(user, pass);

  const parsed = wizklubApi.parseLoginResponse(wizklubData);



  if (!parsed.accessToken) {

    const err = new Error('WizKlub login did not return required tokens');

    err.status = 502;

    throw err;

  }



  if (!parsed.hasPmoRole) {

    const err = new Error('Only accounts with the PMO role can access the PMO portal');

    err.status = 403;

    throw err;

  }



  return {

    role: 'pmo',

    username: parsed.username || user,

    source: 'wizklub',

  };

}



function managedRoleLabel(role) {
  if (role === 'sales_admin') return 'Sales Admin';
  if (role === 'speaker') return 'Speaker';
  if (role === 'pmo') return 'PMO';
  if (role === 'superadmin') return 'Super Admin';
  return role || 'another';
}

async function resolveDbPortalLogin(user, pass, expectedRole) {
  const dbUser = await findUserByUsername(user, { includeInactive: true });
  if (!dbUser || !dbUser.password_hash) return null;
  if (!(await verifyPassword(pass, dbUser.password_hash))) return null;
  if (dbUser.is_active === false) {
    const err = new Error('This account is deactivated. Ask Super Admin to reactivate it.');
    err.status = 403;
    throw err;
  }
  if (dbUser.role !== expectedRole) {
    const err = new Error(
      `Those credentials are for the ${managedRoleLabel(dbUser.role)} portal, not ${managedRoleLabel(expectedRole)}. Go back home and open ${managedRoleLabel(dbUser.role)}.`
    );
    err.status = 403;
    throw err;
  }
  return {
    role: dbUser.role,
    username: dbUser.username,
    source: 'db',
    id: String(dbUser._id),
  };
}



async function resolveLoginRole(user, pass, portal) {

  const portalRole = normalizePortal(portal);

  if (!portalRole) return null;



  if (portalRole === 'superadmin') {

    if (isSuperAdminCredentials(user, pass)) {

      return { role: 'superadmin', username: ADMIN_USER, source: 'env' };

    }

    return null;

  }



  if (portalRole === 'pmo') {

    try {

      return await resolveWizklubPmoLogin(user, pass);

    } catch (error) {

      if (error.status === 403 || error.status === 502) throw error;

      // WizKlub rejected credentials — allow Super Admin–created local PMO accounts.

      return resolveDbPortalLogin(user, pass, 'pmo');

    }

  }



  if (portalRole === 'speaker') {

    return resolveDbPortalLogin(user, pass, 'speaker');

  }



  if (portalRole === 'sales_admin') {

    return resolveDbPortalLogin(user, pass, 'sales_admin');

  }



  return null;

}



function setRoleCookie(res, role, username) {

  res.clearCookie(COOKIE_NAME, clearAuthCookieOpts());

  const val = roleCookieValue(role, username);

  if (role === 'superadmin') {

    res.cookie(COOKIE_NAME_SUPERADMIN, val, { ...COOKIE_OPTS, signed: true });

  } else if (role === 'pmo') {

    res.cookie(COOKIE_NAME_PMO, val, { ...COOKIE_OPTS, signed: true });

  } else if (role === 'speaker') {

    res.cookie(COOKIE_NAME_SPEAKER, val, { ...COOKIE_OPTS, signed: true });

  } else {

    res.cookie(COOKIE_NAME_SALES_ADMIN, val, { ...COOKIE_OPTS, signed: true });

  }

}



async function login(req, res) {

  const user = (req.body && req.body.user ? String(req.body.user) : '').trim();

  const pass = req.body && req.body.pass != null ? String(req.body.pass) : '';

  const portal = req.body && req.body.portal != null ? String(req.body.portal).trim() : '';

  if (!portal) {

    return res.status(400).json({ ok: false, error: 'Login portal is required.' });

  }



  let auth = null;

  try {

    auth = await resolveLoginRole(user, pass, portal);

  } catch (e) {

    console.error('[login]', e && e.message ? e.message : e);

    if (e.status === 403) {

      return res.status(403).json({ ok: false, error: e.message });

    }

    if (e.status === 502) {

      return res.status(502).json({ ok: false, error: e.message });

    }

    if (e.status === 503) {

      return res.status(503).json({ ok: false, error: 'Login unavailable (database not connected).' });

    }

    return res.status(503).json({ ok: false, error: 'Login unavailable.' });

  }

  if (!auth) {

    recordAudit(req, {

      action: 'user.login_failed',

      resourceType: 'auth',

      summary: `Failed login for ${user || '(empty)'} (${portal})`,

    });

    return res.status(401).json({ ok: false, error: 'Invalid username or password.' });

  }



  setRoleCookie(res, auth.role, auth.username);

  recordAudit(

    { ...req, authUser: auth, userRole: auth.role },

    {

      action: 'user.login',

      resourceType: 'auth',

      resourceId: auth.username,

      summary: `${auth.username} logged in as ${auth.role}`,

    }

  );

  return res.json({ ok: true, role: auth.role, username: auth.username });

}



function logout(req, res) {

  const bodyRole =

    req.body && req.body.role != null ? String(req.body.role).trim().toLowerCase() : '';

  const c = clearAuthCookieOpts();

  if (bodyRole === 'superadmin') res.clearCookie(COOKIE_NAME_SUPERADMIN, c);

  else if (bodyRole === 'pmo') res.clearCookie(COOKIE_NAME_PMO, c);

  else if (bodyRole === 'speaker') res.clearCookie(COOKIE_NAME_SPEAKER, c);

  else if (bodyRole === 'sales_admin') res.clearCookie(COOKIE_NAME_SALES_ADMIN, c);

  else {

    res.clearCookie(COOKIE_NAME_SUPERADMIN, c);

    res.clearCookie(COOKIE_NAME_PMO, c);

    res.clearCookie(COOKIE_NAME_SPEAKER, c);

    res.clearCookie(COOKIE_NAME_SALES_ADMIN, c);

    res.clearCookie(COOKIE_NAME, c);

  }

  recordAudit(req, { action: 'user.logout', resourceType: 'auth', summary: `Logout (${bodyRole || 'all'})` });

  return res.json({ ok: true });

}



module.exports = { getMe, login, logout };

