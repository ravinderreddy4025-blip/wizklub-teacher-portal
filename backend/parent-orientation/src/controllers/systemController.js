const { mongo, mongoPingOk } = require('../services/mongo');
const { getLsqWebhookHealth } = require('../services/lsqWebhook');

function publicLsqHealth(lsqWebhook) {
  if (!lsqWebhook || typeof lsqWebhook !== 'object') return null;
  return {
    enabled: Boolean(lsqWebhook.enabled),
    configured: Boolean(lsqWebhook.configured),
    mode: lsqWebhook.mode || null,
    running: Boolean(lsqWebhook.running),
    pendingDue: lsqWebhook.pendingDue == null ? null : lsqWebhook.pendingDue,
  };
}

async function getHealth(req, res) {
  if (!mongo.client) {
    const lsqWebhook = publicLsqHealth(await getLsqWebhookHealth());
    return res.json({ ok: true, mongo: false, mongoConfigured: false, lsqWebhook });
  }
  const alive = await mongoPingOk();
  mongo.ready = alive;
  const lsqWebhook = publicLsqHealth(await getLsqWebhookHealth());
  return res.json({ ok: true, mongo: alive, mongoConfigured: true, lsqWebhook });
}

module.exports = { getHealth, publicLsqHealth };
