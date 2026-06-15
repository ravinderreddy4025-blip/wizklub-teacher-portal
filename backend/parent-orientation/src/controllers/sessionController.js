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
  appendStudentIdToSession,
} = require('../models/sessionModel');
const { isValidStudentId, normalizeStudentId } = require('../domain/studentIds');
const {
  validatePmoBulkPayload,
  validateSpeakerBulkPayload,
  validateCreateOrUpdateItem,
  validateSpeakerMergedPayload,
} = require('../services/sessionMutationService');
const { validateSessionId } = require('../domain/sessions');

const SPEAKER_COMPLETED_WEBHOOK_URL =
  process.env.WIZKLUB_PARENTS_SESSION_WEBHOOK_URL ||
  'https://app.srichaitanyacrm.com/apigateway/wizklub_parents_session_webhook/?token=0fe1304bde5e615bbf297d653e43bd2afba04ad3';

function speakerCompletedWebhookPayload(row) {
  return {
    id: String(row.id || '').trim(),
    scheduled_date: String(row.scheduled_date || '').trim(),
    venue: String(row.venue || '').trim(),
    teacher: String(row.teacher || '').trim(),
    student_ids: Array.isArray(row.student_ids)
      ? row.student_ids.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
  };
}

async function postSpeakerCompletedWebhook(row) {
  const payload = speakerCompletedWebhookPayload(row);
  if (!payload.id) return;
  if (!payload.scheduled_date) return;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(SPEAKER_COMPLETED_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!r.ok) {
      await r.text().catch(() => '');
    }
  } catch (_) {
  } finally {
    clearTimeout(timeout);
  }
}

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
    const body = { ...req.body };
    if (!Array.isArray(body.student_ids)) {
      const existing = all.find((s) => String(s.id) === String(id));
      if (existing && Array.isArray(existing.student_ids)) body.student_ids = existing.student_ids;
    }
    const v = validateCreateOrUpdateItem(body, all, id);
    if (!v.ok) return res.status(v.status).send(v.msg);
    await upsertSessionById(id, body);
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
      const existingById = new Map(
        existing.map((row) => [String(row && row.id != null ? row.id : ''), String(row && row.status ? row.status : '')])
      );
      const completedNow = vMerged.merged.filter((row) => {
        const id = String(row && row.id != null ? row.id : '');
        if (!id) return false;
        const before = existingById.get(id) || '';
        const after = String(row && row.status ? row.status : '');
        return before !== 'Completed' && after === 'Completed';
      });
      await replaceAllBySpeakerMerged(vMerged.merged);
      if (completedNow.length) {
        await Promise.allSettled(completedNow.map((row) => postSpeakerCompletedWebhook(row)));
      }
      return res.status(204).end();
    }
    return res.sendStatus(403);
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB write sessions', err);
    return res.status(500).send('Database write failed');
  }
}

async function postSessionStudentId(req, res) {
  if (!(await ensureMongoWritable(res))) return;
  try {
    const id = req.params.id;
    if (!validateSessionId(id)) return res.status(400).json({ error: 'Invalid session id.' });
    const raw = req.body && req.body.student_id != null ? req.body.student_id : '';
    const studentId = normalizeStudentId(raw);
    if (!isValidStudentId(studentId)) {
      return res.status(400).json({
        error: 'Student ID must be 1–40 characters (letters, digits, hyphen, underscore).',
      });
    }
    const result = await appendStudentIdToSession(id, studentId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.msg });
    }
    return res.json({ student_ids: result.student_ids });
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB add session student id', err);
    return res.status(500).json({ error: 'Database write failed' });
  }
}

module.exports = {
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  replaceSessions,
  postSessionStudentId,
};

