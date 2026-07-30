const { mongo, mongoPingOk } = require('../services/mongo');
const { getLsqWebhookHealth } = require('../services/lsqWebhook');

async function getHealth(req, res) {
  if (!mongo.client) {
    const lsqWebhook = await getLsqWebhookHealth();
    return res.json({ ok: true, mongo: false, mongoConfigured: false, lsqWebhook });
  }
  const alive = await mongoPingOk();
  mongo.ready = alive;
  const lsqWebhook = await getLsqWebhookHealth();
  return res.json({ ok: true, mongo: alive, mongoConfigured: true, lsqWebhook });
}

module.exports = { getHealth };
