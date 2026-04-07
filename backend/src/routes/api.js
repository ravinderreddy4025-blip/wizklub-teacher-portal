const express = require('express');
const fs = require('fs');
const { XLSX_PATH } = require('../config/paths');
const {
  PMO_USER,
  PMO_PASS,
  SPEAKER_USER,
  SPEAKER_PASS,
  ADMIN_USER,
} = require('../config/env');
const {
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  COOKIE_OPTS,
  clearAuthCookieOpts,
  hasPmoCookie,
  hasSpeakerCookie,
  resolveAuthRole,
  requireAuth,
  requirePmo,
} = require('../middleware/auth');
const { loginLimiter, uploadLimiter, apiGeneralLimiter } = require('../middleware/rateLimiters');
const {
  mongo,
  logMongoError,
  mongoPingOk,
  sessionsCollection,
  toSessionDocument,
  readAllSessionsFromDb,
  writePmoSessionsReplaceAll,
  writeSpeakerMergedSessions,
} = require('../services/mongo');
const {
  validateSessionId,
  pmoConflictingGrades,
  pmoScheduleConflictMessage,
  validatePmoSessionRecord,
  validatePmoSessionsBody,
  validateSpeakerSessionsPayload,
  mergeSpeakerUpdates,
  speakerIncomingIdSet,
  validateCompletedAttendedVsInvited,
  validateSpeakerSessionBusinessRules,
} = require('../domain/sessions');
const { writeExcelBufferWithRetry, destPathLabel } = require('../services/excel');

function sendTemplateXlsx(req, res) {
  if (!fs.existsSync(XLSX_PATH)) {
    return res.status(404).send('Template workbook not found on server.');
  }
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.sendFile(XLSX_PATH);
}

function mountApiRoutes(app) {
  app.use(express.json({ limit: '10mb', strict: true }));

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    next(err);
  });

  app.use(apiGeneralLimiter);

  app.get('/api/health', async (req, res) => {
    if (!mongo.client) {
      return res.json({ ok: true, mongo: false, mongoConfigured: false });
    }
    const alive = await mongoPingOk();
    mongo.ready = alive;
    res.json({ ok: true, mongo: alive, mongoConfigured: true });
  });

  app.get('/api/me', (req, res) => {
    const role = resolveAuthRole(req);
    if (role === 'pmo' || role === 'speaker') return res.json({ role });
    if (hasPmoCookie(req) && hasSpeakerCookie(req)) {
      return res.status(401).json({
        role: null,
        error: 'Both PMO and Speaker are signed in — this tab must send header X-PO-Role: pmo or speaker.',
      });
    }
    res.status(401).json({ role: null });
  });

  app.post('/api/login', loginLimiter, (req, res) => {
    const user = (req.body && req.body.user ? String(req.body.user) : '').trim();
    const pass = req.body && req.body.pass != null ? String(req.body.pass) : '';
    let role = null;
    if (user === PMO_USER && pass === PMO_PASS) role = 'pmo';
    else if (ADMIN_USER && user.toLowerCase() === ADMIN_USER && pass === PMO_PASS) role = 'pmo';
    else if (user === SPEAKER_USER && pass === SPEAKER_PASS) role = 'speaker';
    if (!role) return res.status(401).json({ ok: false });
    res.clearCookie(COOKIE_NAME, clearAuthCookieOpts());
    if (role === 'pmo') {
      res.cookie(COOKIE_NAME_PMO, 'pmo', { ...COOKIE_OPTS, signed: true });
    } else {
      res.cookie(COOKIE_NAME_SPEAKER, 'speaker', { ...COOKIE_OPTS, signed: true });
    }
    res.json({ ok: true, role });
  });

  app.post('/api/logout', (req, res) => {
    const bodyRole =
      req.body && req.body.role != null ? String(req.body.role).trim().toLowerCase() : '';
    const c = clearAuthCookieOpts();
    if (bodyRole === 'pmo') {
      res.clearCookie(COOKIE_NAME_PMO, c);
    } else if (bodyRole === 'speaker') {
      res.clearCookie(COOKIE_NAME_SPEAKER, c);
    } else {
      res.clearCookie(COOKIE_NAME_PMO, c);
      res.clearCookie(COOKIE_NAME_SPEAKER, c);
      res.clearCookie(COOKIE_NAME, c);
    }
    res.json({ ok: true });
  });

  app.get('/Parent_Orientation_Tracker.xlsx', requireAuth, sendTemplateXlsx);

  app.get('/api/sessions', requireAuth, async (req, res) => {
    if (!mongo.client) {
      const dis =
        process.env.MONGODB_DISABLED === '1' ||
        process.env.MONGODB_DISABLED === 'true' ||
        process.env.MONGODB_DISABLED === 'yes';
      const uri = typeof process.env.MONGODB_URI === 'string' ? process.env.MONGODB_URI.trim() : '';
      if (dis || !uri) return res.json([]);
      return res.status(503).json({ error: 'Database not connected (check MONGODB_URI and restart the server).' });
    }
    if (!mongo.ready) {
      mongo.ready = await mongoPingOk();
      if (!mongo.ready) {
        return res.status(503).json({ error: 'Database temporarily unavailable — try again or use a saved copy in the browser.' });
      }
    }
    try {
      const list = await readAllSessionsFromDb();
      res.json(list);
    } catch (err) {
      mongo.ready = false;
      logMongoError('MongoDB read sessions', err);
      res.status(500).json({ error: 'Database read failed' });
    }
  });

  app.post('/api/sessions', requireAuth, requirePmo, async (req, res) => {
    if (!mongo.client) {
      return res.status(503).type('text/plain').send('Database not connected.');
    }
    if (!mongo.ready) {
      mongo.ready = await mongoPingOk();
      if (!mongo.ready) return res.status(503).send('Database unavailable.');
    }
    try {
      const item = req.body;
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).send('Expected a single session JSON object.');
      }
      if (!validateSessionId(item.id)) {
        return res.status(400).send('Session must have a valid id.');
      }
      const fieldErr = validatePmoSessionRecord(item);
      if (fieldErr) return res.status(400).send(`Session ${item.id}: ${fieldErr}`);
      const all = await readAllSessionsFromDb();
      if (all.some((s) => String(s.id) === String(item.id))) {
        return res.status(409).type('text/plain').send(`Session ${item.id} already exists.`);
      }
      for (const o of all) {
        const cg = pmoConflictingGrades(item, o);
        if (cg) return res.status(400).send(pmoScheduleConflictMessage(cg));
      }
      await sessionsCollection().insertOne(toSessionDocument(item));
      return res.status(201).end();
    } catch (err) {
      mongo.ready = false;
      logMongoError('MongoDB insert session', err);
      res.status(500).send('Database write failed');
    }
  });

  app.put('/api/sessions/:id', requireAuth, requirePmo, async (req, res) => {
    if (!mongo.client) {
      return res.status(503).type('text/plain').send('Database not connected.');
    }
    if (!mongo.ready) {
      mongo.ready = await mongoPingOk();
      if (!mongo.ready) return res.status(503).send('Database unavailable.');
    }
    try {
      const id = req.params.id;
      if (!validateSessionId(id)) return res.status(400).send('Invalid id in URL.');
      const item = req.body;
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).send('Expected a single session JSON object.');
      }
      if (String(item.id) !== String(id)) {
        return res.status(400).send('JSON body id must match the URL.');
      }
      const fieldErr = validatePmoSessionRecord(item);
      if (fieldErr) return res.status(400).send(`Session ${item.id}: ${fieldErr}`);
      const all = await readAllSessionsFromDb();
      for (const o of all) {
        if (String(o.id) === String(id)) continue;
        const cg = pmoConflictingGrades(item, o);
        if (cg) return res.status(400).send(pmoScheduleConflictMessage(cg));
      }
      await sessionsCollection().replaceOne({ _id: id }, toSessionDocument(item), { upsert: true });
      return res.status(204).end();
    } catch (err) {
      mongo.ready = false;
      logMongoError('MongoDB update session', err);
      res.status(500).send('Database write failed');
    }
  });

  app.delete('/api/sessions/:id', requireAuth, requirePmo, async (req, res) => {
    if (!mongo.client) {
      return res.status(503).type('text/plain').send('Database not connected.');
    }
    if (!mongo.ready) {
      mongo.ready = await mongoPingOk();
      if (!mongo.ready) return res.status(503).send('Database unavailable.');
    }
    try {
      const id = req.params.id;
      if (!validateSessionId(id)) return res.status(400).send('Invalid id.');
      const r = await sessionsCollection().deleteOne({ _id: id });
      if (r.deletedCount === 0) return res.status(404).type('text/plain').send('Not found.');
      return res.status(204).end();
    } catch (err) {
      mongo.ready = false;
      logMongoError('MongoDB delete session', err);
      res.status(500).send('Database write failed');
    }
  });

  app.put('/api/sessions', requireAuth, async (req, res) => {
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
        const v = validatePmoSessionsBody(body);
        if (!v.ok) return res.status(v.status).send(v.msg);
        await writePmoSessionsReplaceAll(body);
        return res.status(204).end();
      }
      if (req.userRole === 'speaker') {
        if (!validateSpeakerSessionsPayload(body)) {
          return res.status(400).send('Expected a JSON array of session objects.');
        }
        const existing = await readAllSessionsFromDb();
        const merged = mergeSpeakerUpdates(existing, body);
        const speakerIds = speakerIncomingIdSet(body);
        const vAtt = validateCompletedAttendedVsInvited(merged, speakerIds);
        if (!vAtt.ok) return res.status(400).send(vAtt.msg);
        const vBiz = validateSpeakerSessionBusinessRules(merged, speakerIds);
        if (!vBiz.ok) return res.status(400).send(vBiz.msg);
        await writeSpeakerMergedSessions(merged);
        return res.status(204).end();
      }
      return res.sendStatus(403);
    } catch (err) {
      mongo.ready = false;
      logMongoError('MongoDB write sessions', err);
      res.status(500).send('Database write failed');
    }
  });

  const uploadExcelParser = express.raw({
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    limit: '10mb',
  });

  app.post(
    '/api/uploadExcel',
    requireAuth,
    requirePmo,
    uploadLimiter,
    uploadExcelParser,
    (req, res) => {
      (async () => {
        try {
          if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
            return res.status(400).send('Empty body.');
          }
          await writeExcelBufferWithRetry(XLSX_PATH, req.body);
          res.sendStatus(200);
        } catch (err) {
          const code = err && err.code;
          if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
            console.warn(
              '[uploadExcel] Workbook file is locked (often open in Excel or OneDrive). Close it or pause sync, then retry.',
              destPathLabel(XLSX_PATH)
            );
            return res
              .status(409)
              .type('text/plain')
              .send(
                'Could not save the Excel file: it is in use or locked. Close Parent_Orientation_Tracker.xlsx in Excel (and any preview), then try again.'
              );
          }
          console.error('Error saving Excel:', err);
          res.status(500).send('Error saving file.');
        }
      })();
    }
  );
}

module.exports = { mountApiRoutes };
