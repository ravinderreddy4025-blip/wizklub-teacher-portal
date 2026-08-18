const {
  listSchools,
  createSchool,
  updateSchool,
  findSchoolById,
  schoolToClient,
} = require('../models/schoolCatalogModel');
const { recordAudit } = require('../services/auditLog');
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

async function getSchools(req, res) {
  if (!(await ensureDb(res))) return;
  const region = req.query.region ? String(req.query.region) : '';
  const search = req.query.search ? String(req.query.search) : '';
  const includeInactive = req.query.includeInactive === '1';
  const schools = await listSchools({ region, search, includeInactive });
  return res.json({ schools });
}

async function postSchool(req, res) {
  if (!(await ensureDb(res))) return;
  const region = String((req.body && req.body.region) || '').trim();
  const branch = String((req.body && req.body.branch) || '').trim();
  if (!region || !branch) return res.status(400).json({ error: 'Region and branch are required.' });
  try {
    const school = await createSchool({
      region,
      branch,
      mapLeft: req.body && req.body.map_left,
      mapTop: req.body && req.body.map_top,
      mapShort: req.body && req.body.map_short,
      updatedBy: req.authUser?.username || 'superadmin',
    });
    await recordAudit(req, {
      action: 'school.created',
      resourceType: 'school',
      resourceId: school.id,
      summary: `Added ${region} / ${branch}`,
      after: school,
    });
    return res.status(201).json({ school });
  } catch (e) {
    if (/duplicate|E11000/i.test(String(e.message))) {
      return res.status(409).json({ error: 'School branch already exists for this region.' });
    }
    throw e;
  }
}

async function putSchool(req, res) {
  if (!(await ensureDb(res))) return;
  const id = String(req.params.id || '');
  const beforeDoc = await findSchoolById(id);
  if (!beforeDoc) return res.sendStatus(404);
  const before = schoolToClient(beforeDoc);
  try {
    const school = await updateSchool(id, {
      region: req.body && req.body.region,
      branch: req.body && req.body.branch,
      map_left: req.body && req.body.map_left,
      map_top: req.body && req.body.map_top,
      map_short: req.body && req.body.map_short,
      is_active: req.body && req.body.is_active,
      updatedBy: req.authUser?.username || 'superadmin',
    });
    await recordAudit(req, {
      action: 'school.updated',
      resourceType: 'school',
      resourceId: id,
      summary: `Updated school ${school.region} / ${school.branch}`,
      before,
      after: school,
    });
    return res.json({ school });
  } catch (e) {
    if (/duplicate|E11000/i.test(String(e.message))) {
      return res.status(409).json({ error: 'School branch already exists for this region.' });
    }
    throw e;
  }
}

async function deleteSchool(req, res) {
  if (!(await ensureDb(res))) return;
  const id = String(req.params.id || '');
  const beforeDoc = await findSchoolById(id);
  if (!beforeDoc) return res.sendStatus(404);
  const before = schoolToClient(beforeDoc);
  const school = await updateSchool(id, {
    is_active: false,
    updatedBy: req.authUser?.username || 'superadmin',
  });
  await recordAudit(req, {
    action: 'school.deactivated',
    resourceType: 'school',
    resourceId: id,
    summary: `Deactivated ${before.region} / ${before.branch}`,
    before,
    after: school,
  });
  return res.json({ school });
}

module.exports = { getSchools, postSchool, putSchool, deleteSchool };
