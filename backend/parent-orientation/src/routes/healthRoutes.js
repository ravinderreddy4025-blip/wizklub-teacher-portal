/**
 * School health report API (PMO + Super Admin). Contract: HEALTH_CONTRACT.md v1.
 * Every read returns `{ run: null }` (HTTP 200) when no snapshot exists yet.
 */
const { requireAuth, requirePmoOrSuperAdmin } = require('../middleware/auth');
const { mongo, logMongoError } = require('../services/mongo');
const health = require('../services/healthService');
const { recordAudit } = require('../services/auditLog');

const ID_RE = /^[A-Za-z0-9._@:-]{1,80}$/;

function guard(handler) {
  return async (req, res) => {
    if (!mongo.client) return res.json({ run: null, unavailable: true });
    try {
      await handler(req, res);
    } catch (err) {
      logMongoError('[health] request failed', err);
      if (!res.headersSent) res.status(500).json({ error: 'Could not load health data' });
    }
  };
}

function badId(res) {
  return res.status(400).json({ error: 'Invalid id' });
}

function mountHealthRoutes(app) {
  const auth = [requireAuth, requirePmoOrSuperAdmin];

  app.get('/api/health/summary', ...auth, guard(async (req, res) => {
    res.json(await health.getSummary());
  }));

  app.get('/api/health/schools', ...auth, guard(async (req, res) => {
    res.json(await health.listSchools(req.query || {}));
  }));

  app.get('/api/health/schools/:schoolId', ...auth, guard(async (req, res) => {
    if (!ID_RE.test(req.params.schoolId)) return badId(res);
    const out = await health.getSchool(req.params.schoolId);
    if (out.notFound) return res.status(404).json({ run: out.run, error: 'School not found in the latest snapshot' });
    res.json(out);
  }));

  // Additive to the contract: target of every clickable R/A/G count on the school list / report.
  app.get('/api/health/schools/:schoolId/students', ...auth, guard(async (req, res) => {
    if (!ID_RE.test(req.params.schoolId)) return badId(res);
    const out = await health.getSchoolStudents(req.params.schoolId, req.query || {});
    if (out.notFound) return res.status(404).json({ run: out.run, error: 'School not found in the latest snapshot' });
    res.json(out);
  }));

  app.get('/api/health/batches/:batchId', ...auth, guard(async (req, res) => {
    if (!ID_RE.test(req.params.batchId)) return badId(res);
    const out = await health.getBatch(req.params.batchId);
    if (out.notFound) return res.status(404).json({ run: out.run, error: 'Batch not found in the latest snapshot' });
    res.json(out);
  }));

  app.get('/api/health/students/:batchId/:username', ...auth, guard(async (req, res) => {
    if (!ID_RE.test(req.params.batchId) || !ID_RE.test(req.params.username)) return badId(res);
    const out = await health.getStudent(req.params.batchId, req.params.username);
    if (out.notFound) return res.status(404).json({ run: out.run, error: 'Student not found in the latest snapshot' });
    res.json(out);
  }));

  app.get('/api/health/schools/:schoolId/followups', ...auth, guard(async (req, res) => {
    if (!ID_RE.test(req.params.schoolId)) return badId(res);
    res.json({
      followups: await health.listFollowups(req.params.schoolId),
      triggers: health.FOLLOWUP_TRIGGERS,
      renag_days: health.RENAG_DAYS,
      email_enabled: require('../config/mail').mailConfig().enabled,
    });
  }));

  app.post('/api/health/schools/:schoolId/followups', ...auth, guard(async (req, res) => {
    if (!ID_RE.test(req.params.schoolId)) return badId(res);
    const actor = req.authUser || { username: req.userRole, role: req.userRole };
    const out = await health.createFollowup(req.params.schoolId, req.body, actor);
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    await recordAudit(req, {
      action: 'health_followup_create',
      resourceType: 'health_followup',
      resourceId: out.followup.id,
      summary: `${out.followup.type} · ${out.followup.trigger} · school ${out.followup.school_id}`,
      after: { type: out.followup.type, trigger: out.followup.trigger, school_id: out.followup.school_id },
    });
    res.status(201).json(out);
  }));

  // Re-send the email for a delegation / open action item (after fixing the address or switching SMTP on).
  app.post('/api/health/followups/:id/notify', ...auth, guard(async (req, res) => {
    const out = await health.resendFollowupNotice(req.params.id);
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    await recordAudit(req, {
      action: 'health_followup_notify',
      resourceType: 'health_followup',
      resourceId: out.followup.id,
      summary: `email ${out.result ? out.result.status : 'n/a'} → ${out.followup.notify ? out.followup.notify.to : ''}`,
      after: { notify_status: out.result ? out.result.status : null },
    });
    res.json(out);
  }));

  app.patch('/api/health/followups/:id', ...auth, guard(async (req, res) => {
    const out = await health.updateFollowup(req.params.id, req.body);
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    await recordAudit(req, {
      action: 'health_followup_update',
      resourceType: 'health_followup',
      resourceId: out.followup.id,
      summary: `${out.followup.type} → ${out.followup.status}`,
      after: { status: out.followup.status },
    });
    res.json(out);
  }));
}

module.exports = { mountHealthRoutes };
