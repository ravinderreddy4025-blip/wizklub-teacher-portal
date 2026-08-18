const { MANAGED_ROLES, USERNAME_RE } = require('../config/constants');
const {
  listUsers,
  createUser,
  findUserById,
  updateUser,
  userToClient,
} = require('../models/userModel');
const { hashPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const { recordAudit } = require('../services/auditLog');
const { mongo, mongoPingOk } = require('../services/mongo');

async function ensureDb(res) {
  if (!mongo.client) {
    res.status(503).json({ error: 'Database not connected.' });
    return false;
  }
  if (!mongo.ready) mongo.ready = await mongoPingOk();
  if (!mongo.ready) {
    res.status(503).json({ error: 'Database unavailable.' });
    return false;
  }
  return true;
}

async function getUsers(req, res) {
  if (!(await ensureDb(res))) return;
  const users = await listUsers();
  return res.json({ users });
}

async function postUser(req, res) {
  if (!(await ensureDb(res))) return;
  const username = String((req.body && req.body.username) || '').trim();
  const password = req.body && req.body.password != null ? String(req.body.password) : '';
  const role = String((req.body && req.body.role) || '').trim();
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–64 characters (letters, digits, dot, underscore, or hyphen).',
    });
  }
  if (!MANAGED_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role.' });
  const pwErr = validatePasswordStrength(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const passwordHash = await hashPassword(password);
    const user = await createUser({
      username,
      passwordHash,
      role,
      createdBy: req.authUser?.username || 'superadmin',
    });
    await recordAudit(req, {
      action: 'user.created',
      resourceType: 'user',
      resourceId: user.id,
      summary: `Created ${role} user ${username}`,
      after: user,
    });
    return res.status(201).json({ user });
  } catch (e) {
    if (/duplicate|E11000|already exists/i.test(String(e.message))) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    throw e;
  }
}

async function putUser(req, res) {
  if (!(await ensureDb(res))) return;
  const id = String(req.params.id || '');
  const beforeDoc = await findUserById(id);
  if (!beforeDoc) return res.sendStatus(404);
  const before = userToClient(beforeDoc);
  const patch = {};
  if (req.body && req.body.username != null) {
    const nextUsername = String(req.body.username).trim();
    if (!USERNAME_RE.test(nextUsername)) {
      return res.status(400).json({
        error: 'Username must be 3–64 characters (letters, digits, dot, underscore, or hyphen).',
      });
    }
    patch.username = nextUsername;
  }
  if (req.body && req.body.role != null) {
    const role = String(req.body.role).trim();
    if (!MANAGED_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role.' });
    patch.role = role;
  }
  if (req.body && req.body.is_active != null) patch.is_active = Boolean(req.body.is_active);
  try {
    const user = await updateUser(id, patch);
    await recordAudit(req, {
      action: 'user.updated',
      resourceType: 'user',
      resourceId: id,
      summary: `Updated user ${user.username}`,
      before,
      after: user,
    });
    return res.json({ user });
  } catch (e) {
    if (/duplicate|E11000|already exists/i.test(String(e.message))) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    throw e;
  }
}

async function putUserPassword(req, res) {
  if (!(await ensureDb(res))) return;
  const id = String(req.params.id || '');
  const beforeDoc = await findUserById(id);
  if (!beforeDoc) return res.sendStatus(404);
  const password = req.body && req.body.password != null ? String(req.body.password) : '';
  const pwErr = validatePasswordStrength(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const passwordHash = await hashPassword(password);
  const user = await updateUser(id, { passwordHash });
  await recordAudit(req, {
    action: 'user.password_reset',
    resourceType: 'user',
    resourceId: id,
    summary: `Password reset for ${user.username}`,
  });
  return res.json({ ok: true });
}

async function deleteUser(req, res) {
  if (!(await ensureDb(res))) return;
  const id = String(req.params.id || '');
  const beforeDoc = await findUserById(id);
  if (!beforeDoc) return res.sendStatus(404);
  const before = userToClient(beforeDoc);
  const user = await updateUser(id, { is_active: false });
  await recordAudit(req, {
    action: 'user.deactivated',
    resourceType: 'user',
    resourceId: id,
    summary: `Deactivated user ${before.username}`,
    before,
    after: user,
  });
  return res.json({ user });
}

module.exports = { getUsers, postUser, putUser, putUserPassword, deleteUser };
