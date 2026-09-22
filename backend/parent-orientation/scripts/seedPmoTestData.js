#!/usr/bin/env node
/**
 * Local dev seed — PMO sessions + Sales Admin targets for monthly UI testing.
 *
 * Default: 20 sessions per month from 2026-01 through 2026-10 (200 rows total).
 * Sessions use ids `pmo-seed-YYYYMM-NN` so re-runs are idempotent.
 *
 *   node scripts/seedPmoTestData.js
 *   node scripts/seedPmoTestData.js --from 2026-01 --to 2026-10 --per-month 20 --with-users
 *
 * Env: MONGO_URI / MONGODB_URI, MONGODB_DB or PMO_MONGO_DB_NAME (default parent_orientation).
 */
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '..', '.env'),
  override: false,
});

const { MongoClient } = require('mongodb');
const catalogSeed = require('../src/config/schoolCatalogSeed');
const { validatePmoSessionRecord } = require('../src/domain/sessions');
const { SESSIONS_COLLECTION, TARGETS_COLLECTION, USERS_COLLECTION } = require('../src/config/constants');
const { hashPassword } = require('../src/utils/passwordUtils');

const URI =
  (process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/?directConnection=true').trim();
const DB =
  (process.env.MONGODB_DB || process.env.PMO_MONGO_DB_NAME || 'parent_orientation').trim();

const SEED_ID_PREFIX = 'pmo-seed-';
const TEACHERS = ['Priya Sharma', 'Rahul Mehta', 'Anita Desai', 'Vikram Singh', 'Neha Kapoor'];
const ENGAGEMENTS = ['H', 'M', 'L'];

function parseArgs(argv) {
  const out = {
    from: '2026-01',
    to: '2026-10',
    perMonth: 20,
    withUsers: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--with-users') out.withUsers = true;
    else if (a === '--from' && argv[i + 1]) out.from = argv[++i];
    else if (a === '--to' && argv[i + 1]) out.to = argv[++i];
    else if (a === '--per-month' && argv[i + 1]) out.perMonth = Math.max(1, Number(argv[++i]) || 20);
  }
  return out;
}

function monthRange(from, to) {
  const out = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function flattenSchools() {
  const pairs = [];
  for (const [region, branches] of Object.entries(catalogSeed.regions || {})) {
    for (const branch of branches) pairs.push({ region, branch });
  }
  return pairs;
}

function seedSessionId(month, index) {
  return `${SEED_ID_PREFIX}${month.replace('-', '')}-${String(index).padStart(2, '0')}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function pickStatus(monthKey, day, index) {
  const [y, m] = monthKey.split('-').map(Number);
  const sessionDay = new Date(y, m - 1, day, 23, 59, 59);
  const now = new Date();
  if (sessionDay > now) return 'Planned';
  if (index % 19 === 0) return 'Cancelled';
  if (index % 14 === 0) return 'Rescheduled';
  return 'Completed';
}

function buildSession(month, index, school) {
  const day = ((index - 1) % 28) + 1;
  const hour = 9 + ((index - 1) % 7);
  const venue = index % 2 === 0 ? 'Online' : 'Offline';
  const invited = 28 + (index % 12);
  const status = pickStatus(month, day, index);
  const session = {
    id: seedSessionId(month, index),
    scheduled_date: `${month}-${pad2(day)}`,
    scheduled_start_time: `${pad2(hour)}:00`,
    scheduled_end_time: `${pad2(hour + 1)}:00`,
    grade: `G${1 + ((index - 1) % 9)}`,
    region: school.region,
    branch: school.branch,
    venue,
    teacher: TEACHERS[(index - 1) % TEACHERS.length],
    co_host: index % 4 === 0 ? 'PM Support' : '',
    location:
      venue === 'Online'
        ? `https://meet.example.com/po/${month.replace('-', '')}/${pad2(index)}`
        : `Auditorium ${index}`,
    invited,
    status,
    attended: '',
    engagement: '',
    follow_up: '',
    follow_up_date: '',
    follow_up_notes: '',
    session_status: '',
    remarks: '',
    update_action: '',
    student_ids: [],
  };

  if (status === 'Completed') {
    session.attended = Math.max(0, invited - (index % 8));
    session.engagement = ENGAGEMENTS[index % ENGAGEMENTS.length];
    session.remarks = index % 3 === 0 ? 'Good parent turnout.' : '';
    if (venue === 'Online' && index % 3 === 0) {
      session.student_ids = [`STU${month.replace('-', '')}${pad2(index)}A`, `STU${month.replace('-', '')}${pad2(index)}B`];
    }
  } else if (status === 'Cancelled') {
    session.update_action = 'Cancelled';
    session.remarks = 'School holiday — session cancelled.';
  } else if (status === 'Rescheduled') {
    session.update_action = 'Rescheduled';
    session.remarks = 'Rescheduled to next week (seed data).';
  }

  const err = validatePmoSessionRecord(session);
  if (err) throw new Error(`${session.id}: ${err}`);
  return session;
}

function targetRowsForMonth(month, schools) {
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < schools.length; i++) {
    const { region, branch } = schools[i];
    const key = `${region}\0${branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      month,
      region,
      branch,
      target_scheduled: 12 + (i % 6),
      target_completed: 6 + (i % 5),
    });
  }
  rows.push({
    month,
    region: '__overall__',
    branch: '__overall__',
    target_scheduled: 40,
    target_completed: 24,
  });
  return rows;
}

async function seedUsers(db) {
  const users = [
    { username: 'test_speaker', role: 'speaker', password: 'LocalTest1!' },
    { username: 'test_sales', role: 'sales_admin', password: 'LocalTest1!' },
  ];
  const coll = db.collection(USERS_COLLECTION);
  const created = [];
  for (const u of users) {
    const existing = await coll.findOne({
      username: { $regex: `^${u.username}$`, $options: 'i' },
    });
    if (existing) {
      created.push({ username: existing.username, role: existing.role, existed: true });
      continue;
    }
    const now = new Date();
    await coll.insertOne({
      username: u.username,
      password_hash: await hashPassword(u.password),
      role: u.role,
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: 'seedPmoTestData',
    });
    created.push({ username: u.username, role: u.role, password: u.password, existed: false });
  }
  return created;
}

async function main() {
  const opts = parseArgs(process.argv);
  const months = monthRange(opts.from, opts.to);
  const schools = flattenSchools();
  if (schools.length < opts.perMonth) {
    throw new Error(`Need at least ${opts.perMonth} schools in catalog seed; got ${schools.length}.`);
  }

  const sessions = [];
  for (const month of months) {
    for (let i = 1; i <= opts.perMonth; i++) {
      const school = schools[(i - 1) % schools.length];
      sessions.push(buildSession(month, i, school));
    }
  }

  let uri = URI;
  let client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000 });
  try {
    await client.connect();
  } catch (firstErr) {
    if (/host\.docker\.internal/i.test(uri)) {
      const fallback = uri.replace(/host\.docker\.internal/gi, '127.0.0.1');
      console.warn(`Could not reach ${uri} — retrying ${fallback}`);
      try {
        await client.close();
      } catch (_) {
        /* not connected */
      }
      uri = fallback;
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000 });
      await client.connect();
    } else {
      throw firstErr;
    }
  }
  const db = client.db(DB);
  console.log(`Connected to ${DB} @ ${uri.replace(/\/\/[^@]+@/, '//***@')}`);

  const sessColl = db.collection(SESSIONS_COLLECTION);
  const now = new Date();
  const sessOps = sessions.map((s) => ({
    replaceOne: {
      filter: { _id: s.id },
      replacement: { ...s, _id: s.id, updatedAt: now },
      upsert: true,
    },
  }));
  const sessResult = await sessColl.bulkWrite(sessOps, { ordered: false });

  const targetColl = db.collection(TARGETS_COLLECTION);
  let targetCount = 0;
  for (const month of months) {
    const monthSchools = schools.slice(0, opts.perMonth);
    const rows = targetRowsForMonth(month, monthSchools);
    const ops = rows.map((t) => ({
      replaceOne: {
        filter: { _id: `${t.month}:${t.region}:${t.branch}` },
        replacement: {
          _id: `${t.month}:${t.region}:${t.branch}`,
          ...t,
          updatedAt: now,
        },
        upsert: true,
      },
    }));
    const tr = await targetColl.bulkWrite(ops, { ordered: false });
    targetCount += tr.upsertedCount + tr.modifiedCount + tr.matchedCount;
  }

  let users = [];
  if (opts.withUsers) users = await seedUsers(db);

  await client.close();

  const byMonth = months.map((m) => {
    const n = sessions.filter((s) => s.scheduled_date.startsWith(m)).length;
    const completed = sessions.filter((s) => s.scheduled_date.startsWith(m) && s.status === 'Completed').length;
    return `  ${m}: ${n} sessions (${completed} completed)`;
  });

  console.log('\nPMO local test data seeded.');
  console.log(`  Sessions: ${sessions.length} upserted (${opts.perMonth}/month × ${months.length} months)`);
  console.log(`  bulkWrite: matched=${sessResult.matchedCount} modified=${sessResult.modifiedCount} upserted=${sessResult.upsertedCount}`);
  console.log('  By month:');
  console.log(byMonth.join('\n'));
  console.log(`  School targets: ${targetCount} row writes across ${months.length} month(s)`);
  if (users.length) {
    console.log('  Portal users:');
    for (const u of users) {
      if (u.existed) console.log(`    ${u.username} (${u.role}) — already existed`);
      else console.log(`    ${u.username} (${u.role}) — password: ${u.password}`);
    }
  } else {
    console.log('  Tip: pass --with-users to create test_speaker and test_sales (password LocalTest1!)');
  }
  console.log('\n  Super Admin: use ADMIN_USER / SUPERADMIN_PASS from .env');
  console.log('  PMO: sign in with your WizKlub PMO account');
  console.log('  Re-run anytime — seed session ids are stable (pmo-seed-*).\n');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
