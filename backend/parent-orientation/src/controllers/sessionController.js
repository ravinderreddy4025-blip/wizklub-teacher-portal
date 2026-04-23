const {
  mongo,
  logMongoError,
  mongoPingOk,
} = require('../services/mongo');
const {
  readAllSessions,
  insertSession,
  upsertSessionById,
  deleteSessionById,
  replaceAllByPmo,
  replaceAllBySpeakerMerged,
} = require('../models/sessionModel');
const {
  validatePmoBulkPayload,
  validateSpeakerBulkPayload,
  validateCreateOrUpdateItem,
  validateSpeakerMergedPayload,
} = require('../services/sessionMutationService');
const { validateSessionId } = require('../domain/sessions');

function mongoDisabledOrMissingConfig() {
  const dis =
    process.env.MONGODB_DISABLED === '1' ||
    process.env.MONGODB_DISABLED === 'true' ||
    process.env.MONGODB_DISABLED === 'yes';
  const uri = typeof process.env.MONGODB_URI === 'string' ? process.env.MONGODB_URI.trim() : '';
  return dis || !uri;
}

async function ensureMongoReadable(res) {
  if (!mongo.client) {
    if (mongoDisabledOrMissingConfig()) {
      res.json([]);
      return false;
    }
    res.status(503).json({ error: 'Database not connected (check MONGODB_URI and restart the server).' });
    return false;
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) {
      res.status(503).json({ error: 'Database temporarily unavailable — try again or use a saved copy in the browser.' });
      return false;
    }
  }
  return true;
}

async function ensureMongoWritable(res) {
  if (!mongo.client) {
    res.status(503).type('text/plain').send('Database not connected.');
    return false;
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) {
      res.status(503).send('Database unavailable.');
      return false;
    }
  }
  return true;
}

async function getSessions(req, res) {
  if (!(await ensureMongoReadable(res))) return;
  try {
    const list = await readAllSessions();
    return res.json(list);
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB read sessions', err);
    return res.status(500).json({ error: 'Database read failed' });
  }
}

async function createSession(req, res) {
  if (!(await ensureMongoWritable(res))) return;
  try {
    const all = await readAllSessions();
    const v = validateCreateOrUpdateItem(req.body, all);
    if (!v.ok) return res.status(v.status).send(v.msg);
    if (all.some((s) => String(s.id) === String(req.body.id))) {
      return res.status(409).type('text/plain').send(`Session ${req.body.id} already exists.`);
    }
    await insertSession(req.body);
    return res.status(201).end();
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB insert session', err);
    return res.status(500).send('Database write failed');
  }
}

async function updateSession(req, res) {
  if (!(await ensureMongoWritable(res))) return;
  try {
    const id = req.params.id;
    if (!validateSessionId(id)) return res.status(400).send('Invalid id in URL.');
    const all = await readAllSessions();
    const v = validateCreateOrUpdateItem(req.body, all, id);
    if (!v.ok) return res.status(v.status).send(v.msg);
    await upsertSessionById(id, req.body);
    return res.status(204).end();
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB update session', err);
    return res.status(500).send('Database write failed');
  }
}

async function deleteSession(req, res) {
  if (!(await ensureMongoWritable(res))) return;
  try {
    const id = req.params.id;
    if (!validateSessionId(id)) return res.status(400).send('Invalid id.');
    const r = await deleteSessionById(id);
    if (r.deletedCount === 0) return res.status(404).type('text/plain').send('Not found.');
    return res.status(204).end();
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB delete session', err);
    return res.status(500).send('Database write failed');
  }
}

async function replaceSessions(req, res) {
  if (!mongo.client) {
    return res
      .status(503)
      .type('text/plain')
      .send(
        'Database not connected — nothing was saved. Set MONGODB_URI in .env (or remove MONGODB_DISABLED) and restart the server.'
      );
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) return res.status(503).send('Database unavailable.');
  }
  try {
    const body = req.body;
    if (req.userRole === 'pmo') {
      const v = validatePmoBulkPayload(body);
      if (!v.ok) return res.status(v.status).send(v.msg);
      await replaceAllByPmo(body);
      return res.status(204).end();
    }
    if (req.userRole === 'speaker') {
      const vPayload = validateSpeakerBulkPayload(body);
      if (!vPayload.ok) return res.status(vPayload.status).send(vPayload.msg);
      const existing = await readAllSessions();
      const vMerged = validateSpeakerMergedPayload(existing, body);
      if (!vMerged.ok) return res.status(vMerged.status).send(vMerged.msg);
      await replaceAllBySpeakerMerged(vMerged.merged);
      return res.status(204).end();
    }
    return res.sendStatus(403);
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB write sessions', err);
    return res.status(500).send('Database write failed');
  }
}

module.exports = {
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  replaceSessions,
};

