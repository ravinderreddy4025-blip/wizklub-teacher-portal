/**
 * WizKlub school health (read side) + PMO follow-ups.
 *
 * Snapshot data lives in a separate database (HEALTH_MONGO_DB_NAME, default `wizklub_health`) on the
 * same Mongo host as the PMO app, written by the health snapshot job. This service only READS it,
 * always from the run flagged `is_latest: true`. Follow-ups are PMO-owned and live in the PMO database
 * (collection `health_followups`). See HEALTH_CONTRACT.md (v1, 19 Sep 2026).
 */
const { ObjectId } = require('mongodb');
const { MONGODB_DB } = require('../config/env');
const { mongo } = require('./mongo');
const notifier = require('./healthNotifier');

const HEALTH_DB_NAME = String(process.env.HEALTH_MONGO_DB_NAME || 'wizklub_health').trim() || 'wizklub_health';
const FOLLOWUPS_COLLECTION = 'health_followups';

const BANDS = ['G', 'A', 'R', 'N'];
const BAND_SEVERITY = { R: 0, A: 1, G: 2, N: 3 };
const FOLLOWUP_TYPES = new Set(['delegation', 'action', 'remark']);
const FOLLOWUP_TRIGGERS = [
  'Low student activity',
  'Delivery behind schedule',
  'Low assessment scores',
  'Students not logged in',
  'Other',
];
/** Action items re-nag the assignee every N days while open. */
const RENAG_DAYS = 3;

function healthDb() {
  if (!mongo.client) return null;
  return mongo.client.db(HEALTH_DB_NAME);
}

function followupsCollection() {
  if (!mongo.client) return null;
  return mongo.client.db(MONGODB_DB).collection(FOLLOWUPS_COLLECTION);
}

function stripId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

function publicRun(run) {
  if (!run) return null;
  return {
    run_id: String(run._id),
    generated_at: run.generated_at || null,
    data_as_of: run.data_as_of || null,
    source: run.source || null,
    window: run.window || null,
    thresholds: run.thresholds || null,
    counts: run.counts || null,
  };
}

async function getLatestRun() {
  const db = healthDb();
  if (!db) return null;
  return db.collection('health_runs').findOne({ is_latest: true }, { sort: { generated_at: -1 } });
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseList(v) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 50);
}

function redCount(s) {
  return ((s.participation && s.participation.R) || 0) + ((s.outcomes && s.outcomes.R) || 0);
}

/** Alphabetical, with placeholder regions ("Unknown Region", blank) last. */
function regionOrder(a, b) {
  const unk = (r) => (/^unknown/i.test(r) ? 1 : 0);
  return unk(a) - unk(b) || a.localeCompare(b);
}

async function getSummary() {
  const run = await getLatestRun();
  if (!run) return { run: null };
  const rows = await healthDb()
    .collection('health_schools')
    .find({ run_id: run._id }, { projection: { overall_band: 1, students: 1, region: 1 } })
    .toArray();
  const schools = { G: 0, A: 0, R: 0, N: 0 };
  let students = 0;
  const regions = new Set();
  for (const r of rows) {
    const b = BANDS.includes(r.overall_band) ? r.overall_band : 'N';
    schools[b] += 1;
    students += Number(r.students) || 0;
    if (r.region) regions.add(String(r.region));
  }
  return { run: publicRun(run), schools, total_schools: rows.length, students, regions: [...regions].sort(regionOrder) };
}

async function listSchools(query = {}) {
  const run = await getLatestRun();
  if (!run) return { run: null, schools: [] };
  const filter = { run_id: run._id };
  const regions = parseList(query.region);
  if (regions.length) filter.region = { $in: regions };
  const minStudents = Number(query.min_students);
  if (Number.isFinite(minStudents) && minStudents > 0) filter.students = { $gt: minStudents };
  const bands = parseList(query.band).map((b) => b.toUpperCase()).filter((b) => BANDS.includes(b));
  if (bands.length) filter.overall_band = { $in: bands };
  const q = String(query.q || '').trim().slice(0, 80);
  if (q) filter.school_name = { $regex: escapeRegex(q), $options: 'i' };

  const rows = (await healthDb().collection('health_schools').find(filter).toArray()).map(stripId);
  const sort = String(query.sort || 'students');
  if (sort === 'name') rows.sort((a, b) => String(a.school_name).localeCompare(String(b.school_name)));
  else if (sort === 'red') rows.sort((a, b) => redCount(b) - redCount(a) || (b.students || 0) - (a.students || 0));
  else rows.sort((a, b) => (b.students || 0) - (a.students || 0) || String(a.school_name).localeCompare(String(b.school_name)));
  return { run: publicRun(run), schools: rows };
}

function studentRedPillars(s) {
  let n = 0;
  if (s.participation && s.participation.band === 'R') n += 1;
  if (s.outcomes && s.outcomes.band === 'R') n += 1;
  return n;
}

async function getSchool(schoolId) {
  const run = await getLatestRun();
  if (!run) return { run: null };
  const db = healthDb();
  const sid = String(schoolId);
  const school = await db.collection('health_schools').findOne({ run_id: run._id, school_id: sid });
  if (!school) return { run: publicRun(run), school: null, notFound: true };
  const batches = (await db.collection('health_batches').find({ run_id: run._id, school_id: sid }).toArray()).map(stripId);
  batches.sort(
    (a, b) =>
      (BAND_SEVERITY[a.overall_band] ?? 9) - (BAND_SEVERITY[b.overall_band] ?? 9) ||
      String(a.batch_name).localeCompare(String(b.batch_name))
  );
  const batchNames = new Map(batches.map((b) => [String(b.batch_id), b]));
  const red = await db
    .collection('health_students')
    .find(
      { run_id: run._id, school_id: sid, $or: [{ 'participation.band': 'R' }, { 'outcomes.band': 'R' }] },
      { projection: { _id: 0 } }
    )
    .toArray();
  red.sort(
    (a, b) =>
      studentRedPillars(b) - studentRedPillars(a) ||
      (a.participation?.pct ?? 101) - (b.participation?.pct ?? 101) ||
      (a.outcomes?.score ?? 101) - (b.outcomes?.score ?? 101)
  );
  const attention = red.slice(0, 50).map((s) => {
    const b = batchNames.get(String(s.batch_id));
    return {
      ...s,
      batch_name: b ? b.batch_name : null,
      teacher: b ? b.teacher : null,
    };
  });
  return { run: publicRun(run), school: stripId(school), batches, attention, attention_total: red.length };
}

const STUDENT_PILLARS = new Set(['participation', 'outcomes', 'attendance', 'overall', 'attention', 'login']);

/**
 * Students of one school filtered by pillar + band (target of every clickable count).
 * pillar=attention → Red on participation or outcomes; band=not_started / not_logged_in are special.
 */
async function getSchoolStudents(schoolId, query = {}) {
  const run = await getLatestRun();
  if (!run) return { run: null };
  const db = healthDb();
  const sid = String(schoolId);
  const school = await db.collection('health_schools').findOne(
    { run_id: run._id, school_id: sid },
    { projection: { _id: 0, school_id: 1, school_name: 1, region: 1, students: 1, batches: 1 } }
  );
  if (!school) return { run: publicRun(run), school: null, notFound: true };
  const pillar = STUDENT_PILLARS.has(String(query.pillar)) ? String(query.pillar) : 'attention';
  const band = String(query.band || 'R');
  const filter = { run_id: run._id, school_id: sid };
  if (pillar === 'attention') filter.$or = [{ 'participation.band': 'R' }, { 'outcomes.band': 'R' }];
  else if (pillar === 'login' || band === 'not_logged_in') filter['login.ever_logged_in'] = { $ne: true };
  else if (band === 'not_started') filter['participation.not_started'] = true;
  else if (BANDS.includes(band)) filter[pillar === 'overall' ? 'overall_band' : `${pillar}.band`] = band;
  const [students, batches] = await Promise.all([
    db.collection('health_students').find(filter, { projection: { _id: 0 } }).limit(5000).toArray(),
    db
      .collection('health_batches')
      .find({ run_id: run._id, school_id: sid }, { projection: { _id: 0, batch_id: 1, batch_name: 1, teacher: 1 } })
      .toArray(),
  ]);
  const byId = new Map(batches.map((b) => [String(b.batch_id), b]));
  students.sort(
    (a, b) =>
      (BAND_SEVERITY[a.overall_band] ?? 9) - (BAND_SEVERITY[b.overall_band] ?? 9) ||
      String(a.name || a.username).localeCompare(String(b.name || b.username))
  );
  const rows = students.map((s) => {
    const b = byId.get(String(s.batch_id));
    return { ...s, batch_name: b ? b.batch_name : null, teacher: b ? b.teacher : null };
  });
  return { run: publicRun(run), school, pillar, band, students: rows };
}

async function getBatch(batchId) {
  const run = await getLatestRun();
  if (!run) return { run: null };
  const db = healthDb();
  const bid = String(batchId);
  const batch = await db.collection('health_batches').findOne({ run_id: run._id, batch_id: bid });
  if (!batch) return { run: publicRun(run), batch: null, notFound: true };
  const students = (await db.collection('health_students').find({ run_id: run._id, batch_id: bid }).toArray()).map(stripId);
  students.sort(
    (a, b) =>
      (BAND_SEVERITY[a.overall_band] ?? 9) - (BAND_SEVERITY[b.overall_band] ?? 9) ||
      String(a.name || a.username).localeCompare(String(b.name || b.username))
  );
  return { run: publicRun(run), batch: stripId(batch), students };
}

async function getStudent(batchId, username) {
  const run = await getLatestRun();
  if (!run) return { run: null };
  const db = healthDb();
  const bid = String(batchId);
  const un = String(username);
  const [batch, student, detail] = await Promise.all([
    db.collection('health_batches').findOne({ run_id: run._id, batch_id: bid }),
    db.collection('health_students').findOne({ run_id: run._id, batch_id: bid, username: un }),
    db.collection('health_student_details').findOne({ run_id: run._id, batch_id: bid, username: un }),
  ]);
  if (!student) return { run: publicRun(run), batch: stripId(batch), student: null, notFound: true };
  return { run: publicRun(run), batch: stripId(batch), student: stripId(student), detail: stripId(detail) || null };
}

/* ---------------------------------------------------------------- follow-ups */

function nextReminderAt(f) {
  if (f.type !== 'action' || f.status !== 'open') return null;
  const base = new Date(f.last_nudged_at || f.created_at);
  if (Number.isNaN(base.getTime())) return null;
  let next = new Date(base.getTime() + RENAG_DAYS * 86400000);
  const now = Date.now();
  while (next.getTime() < now) next = new Date(next.getTime() + RENAG_DAYS * 86400000);
  return next;
}

function followupToClient(f) {
  const { _id, ...rest } = f;
  return { id: String(_id), ...rest, next_reminder_at: nextReminderAt(f) };
}

async function listFollowups(schoolId) {
  const col = followupsCollection();
  if (!col) return [];
  const rows = await col.find({ school_id: String(schoolId) }).sort({ created_at: -1 }).limit(500).toArray();
  return rows.map(followupToClient);
}

function cleanStr(v, max) {
  if (v == null) return '';
  return String(v).replace(/[ -]/g, ' ').trim().slice(0, max);
}

/** @returns {{ error?: string, doc?: object }} */
function buildFollowup(schoolId, body, actor) {
  const b = body && typeof body === 'object' ? body : {};
  const type = cleanStr(b.type, 20).toLowerCase();
  if (!FOLLOWUP_TYPES.has(type)) return { error: 'type must be delegation, action or remark' };
  const trigger = cleanStr(b.trigger, 80);
  if (!trigger) return { error: 'trigger is required' };
  const note = cleanStr(b.note, 2000);
  if (!note) return { error: 'note is required' };
  const assigneeRaw = b.assignee && typeof b.assignee === 'object' ? b.assignee : null;
  const assignee = assigneeRaw
    ? { username: cleanStr(assigneeRaw.username, 80) || null, name: cleanStr(assigneeRaw.name, 120) || null, email: cleanStr(assigneeRaw.email, 160).toLowerCase() || null }
    : typeof b.assignee === 'string' && b.assignee.trim()
      ? { username: cleanStr(b.assignee, 80), name: null, email: null }
      : null;
  if (type === 'delegation' && !(assignee && (assignee.username || assignee.name))) {
    return { error: 'Delegation needs a teacher (assignee)' };
  }
  if (assignee && assignee.email && !notifier.isEmail(assignee.email)) {
    return { error: 'Teacher email does not look valid' };
  }
  let due_at = null;
  if (type === 'action') {
    const d = b.due_at ? new Date(b.due_at) : null;
    if (!d || Number.isNaN(d.getTime())) return { error: 'Action item needs a valid due date' };
    due_at = d;
  }
  const now = new Date();
  const doc = {
    school_id: String(schoolId),
    batch_id: cleanStr(b.batch_id, 80) || null,
    username: cleanStr(b.username, 80) || null,
    type,
    trigger,
    note,
    assignee: type === 'remark' ? null : assignee,
    due_at,
    status: 'open',
    created_by: { username: actor.username || 'unknown', role: actor.role || 'unknown' },
    created_at: now,
    updated_at: now,
    last_nudged_at: null,
    notify: null,
  };
  if (type === 'delegation') {
    doc.notify = { channel: 'email', to: assignee.email || assignee.username || assignee.name, status: 'queued', queued_at: now };
  } else if (type === 'action' && assignee) {
    doc.notify = {
      channel: 'app+email',
      to: assignee.email || assignee.username || assignee.name,
      status: 'queued',
      queued_at: now,
      renag_every_days: RENAG_DAYS,
    };
  }
  return { doc };
}

/** School name from the latest snapshot (used in email subjects). */
async function getSchoolName(schoolId) {
  const run = await getLatestRun();
  if (!run) return null;
  const s = await healthDb()
    .collection('health_schools')
    .findOne({ run_id: run._id, school_id: String(schoolId) }, { projection: { school_name: 1 } });
  return s ? s.school_name : null;
}

async function createFollowup(schoolId, body, actor) {
  const col = followupsCollection();
  if (!col) return { error: 'Database unavailable', status: 503 };
  const { error, doc } = buildFollowup(schoolId, body, actor);
  if (error) return { error, status: 400 };
  const r = await col.insertOne(doc);
  const saved = { _id: r.insertedId, ...doc };
  if (doc.notify) {
    // Sends when HEALTH_EMAIL_ENABLED + SMTP are configured; otherwise records why it could not (never throws).
    try {
      await notifier.deliverFollowupNotice(col, saved, { kind: 'new', schoolName: await getSchoolName(schoolId).catch(() => null) });
    } catch (err) {
      console.error('[health email] could not record notice:', err && err.message ? err.message : err);
    }
    return { followup: followupToClient((await col.findOne({ _id: r.insertedId })) || saved) };
  }
  return { followup: followupToClient(saved) };
}

/** Re-send the notice for one follow-up (e.g. after SMTP was switched on, or after a failure). */
async function resendFollowupNotice(id) {
  const col = followupsCollection();
  if (!col) return { error: 'Database unavailable', status: 503 };
  if (!ObjectId.isValid(String(id))) return { error: 'Invalid id', status: 400 };
  const doc = await col.findOne({ _id: new ObjectId(String(id)) });
  if (!doc) return { error: 'Not found', status: 404 };
  if (!doc.notify) return { error: 'Remarks are not emailed', status: 400 };
  if (doc.status !== 'open') return { error: 'Follow-up is already done', status: 400 };
  const kind = doc.type === 'action' && doc.notify.status === 'sent' ? 'reminder' : 'new';
  const result = await notifier.deliverFollowupNotice(col, doc, { kind, schoolName: await getSchoolName(doc.school_id).catch(() => null) });
  return { followup: followupToClient(await col.findOne({ _id: doc._id })), result };
}

/** Update the recipient email of an open follow-up (PMO can fix a missing / wrong address, then resend). */
async function setFollowupEmail(id, email) {
  const col = followupsCollection();
  if (!col) return { error: 'Database unavailable', status: 503 };
  if (!ObjectId.isValid(String(id))) return { error: 'Invalid id', status: 400 };
  const e = cleanStr(email, 160).toLowerCase();
  if (!notifier.isEmail(e)) return { error: 'Teacher email does not look valid', status: 400 };
  const r = await col.findOneAndUpdate(
    { _id: new ObjectId(String(id)), notify: { $ne: null } },
    { $set: { 'notify.to': e, 'assignee.email': e, updated_at: new Date() } },
    { returnDocument: 'after' }
  );
  const doc = r && r.value !== undefined ? r.value : r;
  if (!doc) return { error: 'Not found', status: 404 };
  return { followup: followupToClient(doc) };
}

async function updateFollowup(id, body) {
  const col = followupsCollection();
  if (!col) return { error: 'Database unavailable', status: 503 };
  if (!ObjectId.isValid(String(id))) return { error: 'Invalid id', status: 400 };
  const b = body && typeof body === 'object' ? body : {};
  const set = { updated_at: new Date() };
  if (b.status != null) {
    const st = String(b.status);
    if (st !== 'open' && st !== 'done') return { error: 'status must be open or done', status: 400 };
    set.status = st;
    set.done_at = st === 'done' ? new Date() : null;
  }
  if (b.email != null) {
    const out = await setFollowupEmail(id, b.email);
    if (out.error) return out;
    if (b.status == null && b.note == null) return out;
  }
  if (b.note != null) {
    const note = cleanStr(b.note, 2000);
    if (!note) return { error: 'note cannot be empty', status: 400 };
    set.note = note;
  }
  if (Object.keys(set).length === 1) return { error: 'Nothing to update', status: 400 };
  const r = await col.findOneAndUpdate({ _id: new ObjectId(String(id)) }, { $set: set }, { returnDocument: 'after' });
  const doc = r && r.value !== undefined ? r.value : r;
  if (!doc) return { error: 'Not found', status: 404 };
  return { followup: followupToClient(doc) };
}

async function ensureFollowupIndexes() {
  const col = followupsCollection();
  if (!col) return;
  await col.createIndex({ school_id: 1, created_at: -1 });
  await col.createIndex({ type: 1, status: 1, last_nudged_at: 1 });
}

module.exports = {
  HEALTH_DB_NAME,
  FOLLOWUP_TRIGGERS,
  RENAG_DAYS,
  getSummary,
  listSchools,
  getSchool,
  getBatch,
  getSchoolStudents,
  getStudent,
  listFollowups,
  createFollowup,
  updateFollowup,
  resendFollowupNotice,
  setFollowupEmail,
  getSchoolName,
  followupsCollection,
  ensureFollowupIndexes,
  buildFollowup,
  nextReminderAt,
};
