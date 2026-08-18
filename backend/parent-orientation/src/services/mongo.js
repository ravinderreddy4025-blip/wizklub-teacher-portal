const { MongoClient } = require('mongodb');
const { MONGODB_DB } = require('../config/env');
const { STATE_DOC_ID, SESSIONS_COLLECTION } = require('../config/constants');
const { validateSessionId } = require('../domain/sessions');
const { migrateLegacyToCanonical } = require('../domain/sessionKeys');
const { normalizeStudentIds } = require('../domain/studentIds');
const { LSQ_INTERNAL_FIELDS, attachLsqWebhookFields } = require('../domain/lsqSync');

function kickLsqWebhookSync() {
  try {
    require('./lsqWebhook').kickLsqWebhookSync();
  } catch (_) {
    /* scheduler optional during early boot */
  }
}

const mongo = {
  client: null,
  ready: false,
};

let lastMongoErrLogAt = 0;
const MONGO_ERR_LOG_INTERVAL_MS = 30_000;

function logMongoError(context, err) {
  const now = Date.now();
  if (now - lastMongoErrLogAt >= MONGO_ERR_LOG_INTERVAL_MS) {
    lastMongoErrLogAt = now;
    const msg = err && err.message ? err.message : String(err);
    console.error(`${context} (${msg}). Further identical failures logged at most every ${MONGO_ERR_LOG_INTERVAL_MS / 1000}s.`);
    console.error(
      'Hint: ping to the host can work while TCP port 27017 is blocked or VPN dropped; run Test-NetConnection <host> -Port 27017 (Windows).'
    );
  }
}

async function mongoPingOk() {
  if (!mongo.client) return false;
  try {
    await mongo.client.db(MONGODB_DB).command({ ping: 1 }, { serverSelectionTimeoutMS: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function appStateCollection() {
  return mongo.client.db(MONGODB_DB).collection('app_state');
}

function sessionsCollection() {
  return mongo.client.db(MONGODB_DB).collection(SESSIONS_COLLECTION);
}

function toSessionDocument(item) {
  const row = migrateLegacyToCanonical({ ...item });
  const now = new Date();
  const location = row.location != null ? String(row.location).trim() : '';
  const student_ids = normalizeStudentIds(row.student_ids);
  return { ...row, _id: row.id, location, student_ids, updatedAt: now };
}

function normalizeSessionRecord(s) {
  if (!s || typeof s !== 'object') return s;
  const st = String(s.status || '');
  const ua = String(s.update_action || '');
  if (st === 'Completed' && ua === 'Rescheduled') return { ...s, status: 'Rescheduled' };
  if (st === 'Completed' && ua === 'Cancelled') return { ...s, status: 'Cancelled' };
  if (!st && ua === 'Rescheduled') return { ...s, status: 'Rescheduled' };
  if (!st && ua === 'Cancelled') return { ...s, status: 'Cancelled' };
  if (!st) return { ...s, status: 'Planned' };
  return s;
}

function sessionDocToClient(doc) {
  if (!doc) return null;
  const rest = { ...doc };
  delete rest._id;
  delete rest.updatedAt;
  for (const key of LSQ_INTERNAL_FIELDS) delete rest[key];
  const id = rest.id != null ? String(rest.id) : String(doc._id);
  const migrated = migrateLegacyToCanonical({ ...rest, id });
  return normalizeSessionRecord(migrated);
}

async function migrateLegacySessionsIfNeeded() {
  const coll = sessionsCollection();
  if ((await coll.countDocuments()) > 0) return;
  const doc = await appStateCollection().findOne({ _id: STATE_DOC_ID });
  const list = doc && Array.isArray(doc.sessions) ? doc.sessions : [];
  if (list.length === 0) return;
  const now = new Date();
  const docs = [];
  for (const s of list) {
    if (s && validateSessionId(s.id)) docs.push({ ...s, _id: s.id, updatedAt: now });
  }
  if (docs.length === 0) return;
  await coll.insertMany(docs, { ordered: false });
  console.log(`Migrated ${docs.length} session(s) from app_state → collection "${SESSIONS_COLLECTION}".`);
}

async function readAllSessionsFromDb() {
  const docs = await sessionsCollection().find({}).toArray();
  if (docs.length > 0) {
    return docs.map(sessionDocToClient);
  }
  try {
    const legacy = await appStateCollection().findOne({ _id: STATE_DOC_ID });
    const list = legacy && Array.isArray(legacy.sessions) ? legacy.sessions : [];
    const out = [];
    for (const s of list) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
      const id = s.id != null ? String(s.id) : s._id != null ? String(s._id) : '';
      if (!validateSessionId(id)) continue;
      const { _id, updatedAt, ...rest } = s;
      out.push(normalizeSessionRecord(migrateLegacyToCanonical({ ...rest, id })));
    }
    return out;
  } catch (_) {
    return [];
  }
}

async function ensureSessionIndexes() {
  const coll = sessionsCollection();
  for (const name of ['lsq_webhook_due_pending', 'lsq_webhook_sent']) {
    try {
      await coll.dropIndex(name);
    } catch (_) {
      /* missing or in use — recreate below */
    }
  }
  await coll.createIndex(
    { 'student_ids.0': 1, lsq_webhook_due_at: 1, lsq_webhook_sent_at: 1 },
    { name: 'lsq_webhook_due_pending' }
  );
  await coll.createIndex({ lsq_webhook_sent_at: 1 }, { name: 'lsq_webhook_sent' });
}

/** Mark unsynced sessions that already have student_ids as immediately due. */
async function backfillLsqWebhookPending() {
  const now = new Date();
  const result = await sessionsCollection().updateMany(
    {
      'student_ids.0': { $exists: true },
      $and: [
        { $or: [{ lsq_webhook_due_at: { $exists: false } }, { lsq_webhook_due_at: null }] },
        { $or: [{ lsq_webhook_sent_at: { $exists: false } }, { lsq_webhook_sent_at: null }] },
        { $or: [{ lsq_webhook_failed_at: { $exists: false } }, { lsq_webhook_failed_at: null }] },
      ],
    },
    { $set: { lsq_webhook_due_at: now } }
  );
  return result.modifiedCount || 0;
}

async function writePmoSessionsReplaceAll(body) {
  const coll = sessionsCollection();
  const ids = body.map((s) => s.id);
  if (ids.length === 0) {
    await coll.deleteMany({});
    return;
  }
  const existingDocs = await coll.find({ _id: { $in: ids } }).toArray();
  const existingById = new Map(existingDocs.map((d) => [String(d._id), d]));
  await coll.deleteMany({ _id: { $nin: ids } });
  const ops = body.map((item) => {
    const replacement = attachLsqWebhookFields(
      toSessionDocument(item),
      existingById.get(String(item.id))
    );
    return {
      replaceOne: {
        filter: { _id: item.id },
        replacement,
        upsert: true,
      },
    };
  });
  await coll.bulkWrite(ops, { ordered: false });
  kickLsqWebhookSync();
}

async function writeSpeakerMergedSessions(mergedList) {
  const coll = sessionsCollection();
  const ids = mergedList.filter((s) => validateSessionId(s.id)).map((s) => s.id);
  if (ids.length === 0) return;
  const existingDocs = await coll.find({ _id: { $in: ids } }).toArray();
  const existingById = new Map(existingDocs.map((d) => [String(d._id), d]));
  const ops = mergedList
    .filter((s) => validateSessionId(s.id))
    .map((item) => {
      const replacement = attachLsqWebhookFields(
        toSessionDocument(item),
        existingById.get(String(item.id))
      );
      return {
        replaceOne: {
          filter: { _id: item.id },
          replacement,
          upsert: false,
        },
      };
    });
  if (ops.length === 0) return;
  await coll.bulkWrite(ops, { ordered: false });
  kickLsqWebhookSync();
}

async function initMongo() {
  const dis = process.env.MONGODB_DISABLED;
  if (dis === '1' || dis === 'true' || dis === 'yes') {
    console.log('MONGODB_DISABLED set — GET /api/sessions returns []; PUT is a no-op (204).');
    return;
  }
  const uri =
    (typeof process.env.MONGODB_URI === 'string' ? process.env.MONGODB_URI.trim() : '') ||
    (typeof process.env.MONGO_URI === 'string' ? process.env.MONGO_URI.trim() : '');
  if (!uri) {
    console.log('MONGO_URI not set — GET /api/sessions returns []; PUT is a no-op (204).');
    return;
  }
  mongo.client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    maxPoolSize: 10,
  });
  await mongo.client.connect();
  await mongo.client.db(MONGODB_DB).command({ ping: 1 });
  mongo.ready = true;
  console.log(`MongoDB connected (database: ${MONGODB_DB}).`);
  try {
    await migrateLegacySessionsIfNeeded();
    await ensureSessionIndexes();
    const backfilled = await backfillLsqWebhookPending();
    if (backfilled > 0) {
      console.log(`[LSQ webhook] Backfilled pending sync on ${backfilled} session(s) with student_ids.`);
    }
    const { seedSchoolTargets } = require('./seedSchoolTargets');
    await seedSchoolTargets();
    const { seedSchoolCatalog } = require('./seedSchoolCatalog');
    await seedSchoolCatalog();
    const { ensureUserIndexes } = require('../models/userModel');
    const { ensureCatalogIndexes } = require('../models/schoolCatalogModel');
    const { ensureAuditIndexes } = require('./auditLog');
    await ensureUserIndexes();
    await ensureCatalogIndexes();
    await ensureAuditIndexes();
  } catch (e) {
    console.error('Session migration/index setup:', e && e.message ? e.message : e);
  }
}

async function closeMongo() {
  if (!mongo.client) return;
  try {
    await mongo.client.close();
  } catch (_) {
    /* ignore */
  }
  mongo.client = null;
  mongo.ready = false;
}

module.exports = {
  mongo,
  logMongoError,
  mongoPingOk,
  initMongo,
  closeMongo,
  appStateCollection,
  sessionsCollection,
  toSessionDocument,
  normalizeSessionRecord,
  sessionDocToClient,
  readAllSessionsFromDb,
  writePmoSessionsReplaceAll,
  writeSpeakerMergedSessions,
  attachLsqWebhookFields,
  kickLsqWebhookSync,
};
