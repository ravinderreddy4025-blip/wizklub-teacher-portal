const { ObjectId } = require('mongodb');
const { USERS_COLLECTION, MANAGED_ROLES, USERNAME_RE } = require('../config/constants');
const { MONGODB_DB } = require('../config/env');
const { mongo } = require('../services/mongo');

function usersCollection() {
  if (!mongo.client) {
    const err = new Error('Database not connected.');
    err.status = 503;
    throw err;
  }
  return mongo.client.db(MONGODB_DB).collection(USERS_COLLECTION);
}

function userToClient(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    username: doc.username,
    role: doc.role,
    is_active: doc.is_active !== false,
    created_at: doc.created_at || null,
    updated_at: doc.updated_at || null,
    created_by: doc.created_by || null,
  };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findUserByUsername(username, opts = {}) {
  const u = String(username || '').trim();
  if (!u) return null;
  const filter = { username: { $regex: `^${escapeRegex(u)}$`, $options: 'i' } };
  if (!opts.includeInactive) filter.is_active = { $ne: false };
  return usersCollection().findOne(filter);
}

async function findUserById(id) {
  if (!ObjectId.isValid(id)) return null;
  return usersCollection().findOne({ _id: new ObjectId(id) });
}

async function listUsers() {
  const docs = await usersCollection().find({}).sort({ username: 1 }).toArray();
  return docs.map(userToClient);
}

async function createUser({ username, passwordHash, role, createdBy }) {
  const u = String(username || '').trim();
  const r = String(role || '').trim();
  if (!USERNAME_RE.test(u)) throw new Error('Invalid username');
  if (!MANAGED_ROLES.has(r)) throw new Error('Invalid role');
  const dup = await findUserByUsername(u, { includeInactive: true });
  if (dup) {
    const err = new Error('Username already exists.');
    err.code = 11000;
    throw err;
  }
  const now = new Date();
  const doc = {
    username: u,
    password_hash: passwordHash,
    role: r,
    is_active: true,
    created_at: now,
    updated_at: now,
    created_by: createdBy || null,
  };
  const result = await usersCollection().insertOne(doc);
  return userToClient({ ...doc, _id: result.insertedId });
}

async function updateUser(id, patch) {
  const existing = await findUserById(id);
  if (!existing) return null;
  const set = { updated_at: new Date() };
  if (patch.username != null) {
    const next = String(patch.username).trim();
    if (!USERNAME_RE.test(next)) throw new Error('Invalid username');
    set.username = next;
  }
  if (patch.role != null) {
    const r = String(patch.role).trim();
    if (!MANAGED_ROLES.has(r)) throw new Error('Invalid role');
    set.role = r;
  }
  if (patch.is_active != null) set.is_active = Boolean(patch.is_active);
  if (patch.passwordHash) set.password_hash = patch.passwordHash;
  await usersCollection().updateOne({ _id: existing._id }, { $set: set });
  return userToClient(await findUserById(id));
}

async function countActiveUsers() {
  return usersCollection().countDocuments({ is_active: { $ne: false } });
}

async function ensureUserIndexes() {
  const col = usersCollection();
  await col.createIndex({ username: 1 }, { unique: true });
}

module.exports = {
  userToClient,
  findUserByUsername,
  findUserById,
  listUsers,
  createUser,
  updateUser,
  countActiveUsers,
  ensureUserIndexes,
};
