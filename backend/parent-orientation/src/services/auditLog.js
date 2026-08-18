const { AUDIT_LOGS_COLLECTION } = require('../config/constants');
const { MONGODB_DB } = require('../config/env');
const { mongo } = require('./mongo');

function auditCollection() {
  if (!mongo.client) return null;
  return mongo.client.db(MONGODB_DB).collection(AUDIT_LOGS_COLLECTION);
}

function actorFromReq(req) {
  if (req.authUser) {
    return { username: req.authUser.username, role: req.authUser.role };
  }
  if (req.userRole === 'superadmin') {
    return { username: req.authUser?.username || 'superadmin', role: 'superadmin' };
  }
  return { username: req.authUser?.username || req.userRole || 'unknown', role: req.userRole || 'unknown' };
}

async function recordAudit(req, payload) {
  try {
    const col = auditCollection();
    if (!col) return;
    const actor = actorFromReq(req);
    const doc = {
      timestamp: new Date(),
      actor_username: actor.username,
      actor_role: actor.role,
      action: String(payload.action || 'unknown'),
      resource_type: payload.resourceType ? String(payload.resourceType) : null,
      resource_id: payload.resourceId != null ? String(payload.resourceId) : null,
      summary: payload.summary ? String(payload.summary) : '',
      before: payload.before !== undefined ? payload.before : null,
      after: payload.after !== undefined ? payload.after : null,
      ip: req.ip || req.connection?.remoteAddress || null,
      user_agent: req.get ? req.get('user-agent') || null : null,
    };
    await col.insertOne(doc);
  } catch (e) {
    console.error('[audit]', e && e.message ? e.message : e);
  }
}

async function listDistinctAuditActors() {
  const col = auditCollection();
  if (!col) return [];
  const rows = await col
    .aggregate([
      { $match: { actor_username: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: '$actor_username',
          count: { $sum: 1 },
          roles: { $addToSet: '$actor_role' },
          last_at: { $max: '$timestamp' },
        },
      },
      { $sort: { last_at: -1 } },
      {
        $project: {
          _id: 0,
          username: '$_id',
          count: 1,
          roles: 1,
        },
      },
    ])
    .toArray();
  return rows;
}

async function listAuditLogs({ page = 1, limit = 50, actor, action, resourceType, from, to } = {}) {
  const col = auditCollection();
  if (!col) return { items: [], total: 0, page, limit };
  const q = {};
  if (actor) q.actor_username = new RegExp(String(actor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (action) q.action = String(action);
  if (resourceType) q.resource_type = String(resourceType);
  if (from || to) {
    q.timestamp = {};
    if (from) q.timestamp.$gte = new Date(from);
    if (to) q.timestamp.$lte = new Date(to);
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;
  const [items, total] = await Promise.all([
    col.find(q).sort({ timestamp: -1 }).skip(skip).limit(safeLimit).toArray(),
    col.countDocuments(q),
  ]);
  return { items, total, page: safePage, limit: safeLimit };
}

async function ensureAuditIndexes() {
  const col = auditCollection();
  if (!col) return;
  await col.createIndex({ timestamp: -1 });
  await col.createIndex({ actor_username: 1, timestamp: -1 });
  await col.createIndex({ resource_type: 1, resource_id: 1 });
}

module.exports = { recordAudit, listAuditLogs, listDistinctAuditActors, ensureAuditIndexes };
