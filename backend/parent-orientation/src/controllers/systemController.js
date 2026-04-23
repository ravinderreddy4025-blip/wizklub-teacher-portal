const { mongo, mongoPingOk } = require('../services/mongo');

async function getHealth(req, res) {
  if (!mongo.client) {
    return res.json({ ok: true, mongo: false, mongoConfigured: false });
  }
  const alive = await mongoPingOk();
  mongo.ready = alive;
  return res.json({ ok: true, mongo: alive, mongoConfigured: true });
}

module.exports = { getHealth };

