const { listAuditLogs, listDistinctAuditActors } = require('../services/auditLog');
const { mongo, mongoPingOk, sessionsCollection, sessionDocToClient } = require('../services/mongo');
const { readAllSessions } = require('../models/sessionModel');
const {
  sessionCreatedSummary,
  sessionUpdatedSummary,
  sessionDeletedSummary,
  sessionAuditFields,
} = require('../utils/auditSummary');

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

function mapAuditDoc(d) {
  return {
    id: String(d._id),
    timestamp: d.timestamp,
    actor_username: d.actor_username,
    actor_role: d.actor_role,
    action: d.action,
    resource_type: d.resource_type,
    resource_id: d.resource_id,
    summary: d.summary,
    before: d.before,
    after: d.after,
    ip: d.ip,
  };
}

function auditActorFromDoc(d) {
  return {
    username: d.actor_username,
    role: d.actor_role,
  };
}

function rebuildSessionSummary(action, session, actor, fallback) {
  if (!session) return fallback;
  if (action === 'session.created') return sessionCreatedSummary(session, actor);
  if (action === 'session.updated') return sessionUpdatedSummary(session, actor);
  if (action === 'session.deleted') return sessionDeletedSummary(session, actor);
  return fallback;
}

async function loadSessionsByIds(ids) {
  const sessionMap = new Map();
  if (!ids.length || !mongo.client) return sessionMap;
  const docs = await sessionsCollection()
    .find({ _id: { $in: ids } })
    .toArray();
  docs.forEach((doc) => {
    const client = sessionDocToClient(doc);
    if (client && client.id) sessionMap.set(String(client.id), client);
  });
  return sessionMap;
}

async function enrichSessionAuditItems(items) {
  const sessionIds = [
    ...new Set(
      items
        .filter((d) => d.resource_type === 'session' && d.resource_id)
        .map((d) => String(d.resource_id))
    ),
  ];
  if (!sessionIds.length) return items;

  const sessionMap = await loadSessionsByIds(sessionIds);

  return items.map((item) => {
    if (item.resource_type !== 'session' || !item.resource_id) return item;
    const snap = sessionMap.get(String(item.resource_id));
    const actor = auditActorFromDoc(item);
    let after = item.after;
    let before = item.before;

    if (item.action === 'session.deleted') {
      if (!before && snap) before = snap;
    } else if (!after && snap) {
      after = snap;
    }

    const session = item.action === 'session.deleted' ? before || snap : after || snap;
    const summary = rebuildSessionSummary(item.action, session, actor, item.summary);
    const session_fields = session ? sessionAuditFields(session) : [];

    return { ...item, after, before, summary, session_fields };
  });
}

async function getAuditLogs(req, res) {
  if (!(await ensureDb(res))) return;
  const [result, actors] = await Promise.all([
    listAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      actor: req.query.actor,
      action: req.query.action,
      resourceType: req.query.resourceType,
      from: req.query.from,
      to: req.query.to,
    }),
    listDistinctAuditActors(),
  ]);
  let items = result.items.map(mapAuditDoc);
  items = await enrichSessionAuditItems(items);
  return res.json({ ...result, items, actors });
}

async function getAdminSessions(req, res) {
  if (!(await ensureDb(res))) return;
  try {
    const sessions = await readAllSessions();
    return res.json({ sessions });
  } catch (e) {
    console.error('[admin sessions]', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not load sessions.' });
  }
}

module.exports = { getAuditLogs, getAdminSessions };
