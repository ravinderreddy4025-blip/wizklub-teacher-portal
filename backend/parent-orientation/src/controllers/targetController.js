const {
  mongo,
  logMongoError,
  mongoPingOk,
  readAllSessionsFromDb,
} = require('../services/mongo');
const { recordAudit } = require('../services/auditLog');
const {
  MONTH_RE,
  readTargetsForMonth,
  upsertTargetsForMonth,
  isOverallTargetRow,
} = require('../models/targetModel');

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
      return false;
    }
    res.status(503).json({ error: 'Database not connected.' });
    return false;
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) {
      res.status(503).json({ error: 'Database temporarily unavailable.' });
      return false;
    }
  }
  return true;
}

async function ensureMongoWritable(res) {
  if (!mongo.client) {
    res.status(503).json({ error: 'Database not connected.' });
    return false;
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) {
      res.status(503).json({ error: 'Database unavailable.' });
      return false;
    }
  }
  return true;
}

function parseMonthQuery(req) {
  const month = String(req.query.month || '').trim();
  if (!MONTH_RE.test(month)) return null;
  return month;
}

function sessionMonthKey(s) {
  const d = String(s.scheduled_date || '').trim();
  if (d.length >= 7 && /^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  return null;
}

/** Pending vs done: Planned/Rescheduled count as scheduled; Completed counts as completed (not both). */
function countSessionsBySchool(sessions, month) {
  const map = Object.create(null);
  for (const s of sessions) {
    const mk = sessionMonthKey(s);
    if (mk !== month) continue;
    const region = String(s.region || '').trim();
    const branch = String(s.branch || '').trim();
    if (!region || !branch) continue;
    const key = `${region}\u0001${branch}`;
    if (!map[key]) map[key] = { region, branch, scheduled: 0, completed: 0 };
    const status = String(s.status || '').trim();
    if (status === 'Completed') {
      map[key].completed += 1;
    } else if (status === 'Planned' || status === 'Rescheduled') {
      map[key].scheduled += 1;
    }
  }
  return map;
}

function schoolTargetsFromRows(targetRows) {
  const targetMap = Object.create(null);
  for (const t of targetRows) {
    if (isOverallTargetRow(t)) continue;
    const key = `${t.region}\u0001${t.branch}`;
    targetMap[key] = t;
  }
  return targetMap;
}

function buildFulfillmentPayload(month, sessions, targetRows) {
  const actualMap = countSessionsBySchool(sessions, month);
  const targetMap = schoolTargetsFromRows(targetRows);
  const keys = new Set([...Object.keys(actualMap), ...Object.keys(targetMap)]);
  const schools = [];
  for (const key of keys) {
    const actual = actualMap[key] || {
      region: targetMap[key]?.region || key.split('\u0001')[0] || '',
      branch: targetMap[key]?.branch || key.split('\u0001')[1] || '',
      scheduled: 0,
      completed: 0,
    };
    const tgt = targetMap[key] || { target_completed: 0 };
    schools.push({
      region: actual.region || '',
      branch: actual.branch || '',
      target_completed: tgt.target_completed || 0,
      actual_scheduled: actual.scheduled || 0,
      actual_completed: actual.completed || 0,
    });
  }
  schools.sort(
    (a, b) =>
      a.region.localeCompare(b.region, undefined, { sensitivity: 'base' }) ||
      a.branch.localeCompare(b.branch, undefined, { sensitivity: 'base' })
  );

  const summary = schools.reduce(
    (acc, row) => {
      acc.target_completed += row.target_completed;
      acc.actual_scheduled += row.actual_scheduled;
      acc.actual_completed += row.actual_completed;
      if (row.target_completed > 0 && row.actual_completed >= row.target_completed) {
        acc.schools_met += 1;
      }
      if (row.target_completed > 0) acc.schools_with_targets += 1;
      return acc;
    },
    {
      target_completed: 0,
      actual_scheduled: 0,
      actual_completed: 0,
      schools_met: 0,
      schools_with_targets: 0,
    }
  );
  summary.completion_pct =
    summary.target_completed > 0
      ? Math.min(100, Math.round((summary.actual_completed / summary.target_completed) * 100))
      : null;
  summary.target_met =
    summary.target_completed > 0 && summary.actual_completed >= summary.target_completed;

  return { month, summary, schools };
}

function filterSchoolTargets(rows) {
  return rows
    .filter((t) => !isOverallTargetRow(t))
    .map((t) => ({
      region: t.region,
      branch: t.branch,
      target_completed: t.target_completed || 0,
    }));
}

async function getTargets(req, res) {
  const month = parseMonthQuery(req);
  if (!month) return res.status(400).json({ error: 'Query month=YYYY-MM is required' });
  if (!mongo.client && mongoDisabledOrMissingConfig()) {
    return res.json({ month, targets: [] });
  }
  if (!(await ensureMongoReadable(res))) return;
  try {
    const rows = await readTargetsForMonth(month);
    return res.json({ month, targets: filterSchoolTargets(rows) });
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB read targets', err);
    return res.status(500).json({ error: 'Database read failed' });
  }
}

async function putTargets(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const month = String(body.month || '').trim();
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'Body month must be YYYY-MM' });
  const rows = Array.isArray(body.targets) ? body.targets : [];
  if (!(await ensureMongoWritable(res))) return;
  try {
    const normalized = rows.map((row) => ({
      month,
      region: String(row.region || '').trim(),
      branch: String(row.branch || '').trim(),
      target_scheduled: 0,
      target_completed: Math.max(0, Math.floor(Number(row.target_completed) || 0)),
    }));
    await upsertTargetsForMonth(month, normalized);
    const saved = await readTargetsForMonth(month);
    await recordAudit(req, {
      action: 'target.updated',
      resourceType: 'school_targets',
      resourceId: month,
      summary: `Updated ${normalized.length} school target(s) for ${month}`,
      after: { count: normalized.length, month },
    });
    return res.json({ month, targets: filterSchoolTargets(saved) });
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB write targets', err);
    return res.status(500).json({ error: 'Database write failed' });
  }
}

async function getFulfillment(req, res) {
  const month = parseMonthQuery(req);
  if (!month) return res.status(400).json({ error: 'Query month=YYYY-MM is required' });
  if (!mongo.client && mongoDisabledOrMissingConfig()) {
    return res.json(buildFulfillmentPayload(month, [], []));
  }
  if (!(await ensureMongoReadable(res))) return;
  try {
    const [sessions, targetRows] = await Promise.all([
      readAllSessionsFromDb(),
      readTargetsForMonth(month),
    ]);
    return res.json(buildFulfillmentPayload(month, sessions, targetRows));
  } catch (err) {
    mongo.ready = false;
    logMongoError('MongoDB fulfillment', err);
    return res.status(500).json({ error: 'Database read failed' });
  }
}

module.exports = {
  getTargets,
  putTargets,
  getFulfillment,
  isOverallTargetRow,
  buildFulfillmentPayload,
  parseMonthQuery,
};
