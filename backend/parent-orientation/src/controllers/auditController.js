const { listAuditLogs, listDistinctAuditActors } = require('../services/auditLog');
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
  const items = result.items.map((d) => ({
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
  }));
  return res.json({ ...result, items, actors });
}

module.exports = { getAuditLogs };
