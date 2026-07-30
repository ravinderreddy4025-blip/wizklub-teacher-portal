const { TARGETS_COLLECTION } = require('../config/constants');
const { MONGODB_DB } = require('../config/env');
const { mongo } = require('../services/mongo');

const MONTH_RE = /^\d{4}-\d{2}$/;
const OVERALL_REGION = '__overall__';
const OVERALL_BRANCH = '__overall__';

function targetsCollection() {
  return mongo.client.db(MONGODB_DB).collection(TARGETS_COLLECTION);
}

function targetDocId(month, region, branch) {
  return `${month}:${region}:${branch}`;
}

function overallTargetDocId(month) {
  return targetDocId(month, OVERALL_REGION, OVERALL_BRANCH);
}

function isOverallTargetRow(row) {
  return row.region === OVERALL_REGION && row.branch === OVERALL_BRANCH;
}

function normalizeTargetRow(row) {
  const month = String(row.month || '').trim();
  const region = String(row.region || '').trim();
  const branch = String(row.branch || '').trim();
  const target_scheduled = Math.max(0, Math.floor(Number(row.target_scheduled) || 0));
  const target_completed = Math.max(0, Math.floor(Number(row.target_completed) || 0));
  return { month, region, branch, target_scheduled, target_completed };
}

function validateTargetRow(row) {
  const t = normalizeTargetRow(row);
  if (!MONTH_RE.test(t.month)) return { ok: false, error: 'Invalid month (use YYYY-MM)' };
  if (!t.region) return { ok: false, error: 'Region is required' };
  if (!t.branch) return { ok: false, error: 'Branch is required' };
  return { ok: true, value: t };
}

async function readTargetsForMonth(month) {
  const coll = targetsCollection();
  const docs = await coll.find({ month }).toArray();
  return docs.map((d) => {
    const { _id, updatedAt, ...rest } = d;
    return {
      month: rest.month,
      region: rest.region,
      branch: rest.branch,
      target_scheduled: rest.target_scheduled || 0,
      target_completed: rest.target_completed || 0,
    };
  });
}

async function readOverallTarget(month) {
  const coll = targetsCollection();
  const doc = await coll.findOne({ _id: overallTargetDocId(month) });
  if (!doc) {
    return { month, target_scheduled: 0, target_completed: 0 };
  }
  return {
    month,
    target_scheduled: doc.target_scheduled || 0,
    target_completed: doc.target_completed || 0,
  };
}

async function upsertOverallTarget(month, overall) {
  const target_scheduled = Math.max(0, Math.floor(Number(overall && overall.target_scheduled) || 0));
  const target_completed = Math.max(0, Math.floor(Number(overall && overall.target_completed) || 0));
  const now = new Date();
  await targetsCollection().replaceOne(
    { _id: overallTargetDocId(month) },
    {
      _id: overallTargetDocId(month),
      month,
      region: OVERALL_REGION,
      branch: OVERALL_BRANCH,
      target_scheduled,
      target_completed,
      updatedAt: now,
    },
    { upsert: true }
  );
  return readOverallTarget(month);
}

async function upsertTargetsForMonth(month, rows) {
  const coll = targetsCollection();
  const now = new Date();
  const ops = [];
  for (const row of rows) {
    const v = validateTargetRow({ ...row, month });
    if (!v.ok) continue;
    const t = v.value;
    ops.push({
      replaceOne: {
        filter: { _id: targetDocId(t.month, t.region, t.branch) },
        replacement: {
          _id: targetDocId(t.month, t.region, t.branch),
          month: t.month,
          region: t.region,
          branch: t.branch,
          target_scheduled: t.target_scheduled,
          target_completed: t.target_completed,
          updatedAt: now,
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await coll.bulkWrite(ops, { ordered: false });
  return readTargetsForMonth(month);
}

module.exports = {
  MONTH_RE,
  OVERALL_REGION,
  OVERALL_BRANCH,
  validateTargetRow,
  readTargetsForMonth,
  readOverallTarget,
  upsertOverallTarget,
  upsertTargetsForMonth,
  isOverallTargetRow,
};
