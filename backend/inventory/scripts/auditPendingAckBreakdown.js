/**
 * Audit where pending-acknowledgement and outstanding kit totals come from.
 * Usage: node scripts/auditPendingAckBreakdown.js
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { pendingAckKitsOnDispatch } = require('../src/utils/operationsKpi');
const { getOperationsSnapshot } = require('../src/services/operationsSnapshotService');
const monthlyReportService = require('../src/services/monthlyReportService');
const { loadPendingDispatchRows, findSchool } = require('./syncCombinedSchoolKitSpreadsheet');

loadRootEnv();

const School = require('../src/models/School');
const Dispatch = require('../src/models/Dispatch');

function bucketSchoolCode(code) {
  const value = String(code || '');
  if (/^NSC-\d{3}\/26$/i.test(value)) return 'IL pending cohort (NSC-/26)';
  if (/^SC-\d{3}\/26/i.test(value)) return 'SC /26 cohort';
  if (/^NSC-/i.test(value)) return 'Other NSC';
  if (/^SC-/i.test(value)) return 'Other SC';
  return 'Other / legacy code';
}

async function main() {
  await mongoose.connect(resolveInventoryMongoUri());

  const [allSchools, dispatches, snapshot] = await Promise.all([
    School.find({}).select('name code').lean(),
    Dispatch.find({ status: { $ne: 'Pending' } })
      .select('status quantity quantityAcknowledged outstandingQuantity school kit cycles dispatchedAt createdAt')
      .lean(),
    getOperationsSnapshot(monthlyReportService.currentMonth()),
  ]);

  const pendingSchools = loadPendingDispatchRows().schools;

  const pendingCohortSchoolIds = new Set();
  pendingSchools.forEach((schoolGroup) => {
    const record = findSchool(allSchools, schoolGroup.schoolCode, schoolGroup.schoolName);
    if (record) pendingCohortSchoolIds.add(String(record._id));
  });

  const schoolById = new Map(allSchools.map((s) => [String(s._id), s]));

  let pendingAckTotal = 0;
  let outstandingTotal = 0;
  const byStatus = new Map();
  const byCodeBucket = new Map();
  const byCohort = {
    pendingCohort: { schools: new Set(), pendingKits: 0, dispatches: 0 },
    other: { schools: new Set(), pendingKits: 0, dispatches: 0 },
  };
  const topSchools = new Map();

  dispatches.forEach((dispatch) => {
    const pending = pendingAckKitsOnDispatch(dispatch);
    const outstanding = Number(dispatch.outstandingQuantity) || 0;
    pendingAckTotal += pending;
    outstandingTotal += outstanding;

    const status = dispatch.status || 'unknown';
    if (!byStatus.has(status)) byStatus.set(status, { pending: 0, outstanding: 0, count: 0 });
    const statusRow = byStatus.get(status);
    statusRow.pending += pending;
    statusRow.outstanding += outstanding;
    statusRow.count += 1;

    const school = schoolById.get(String(dispatch.school));
    const code = school?.code || 'unknown';
    const bucket = bucketSchoolCode(code);
    if (!byCodeBucket.has(bucket)) byCodeBucket.set(bucket, { pending: 0, outstanding: 0, schools: new Set() });
    const bucketRow = byCodeBucket.get(bucket);
    bucketRow.pending += pending;
    bucketRow.outstanding += outstanding;
    if (pending > 0) bucketRow.schools.add(String(dispatch.school));

    if (pending > 0 && school) {
      const inPendingCohort = pendingCohortSchoolIds.has(String(school._id));
      const cohort = inPendingCohort ? byCohort.pendingCohort : byCohort.other;

      cohort.pendingKits += pending;
      cohort.dispatches += 1;
      cohort.schools.add(String(school._id));

      const key = `${code} — ${school.name}`;
      topSchools.set(key, (topSchools.get(key) || 0) + pending);
    }
  });

  const expectedPending = pendingSchools.reduce(
    (sum, s) => sum + s.kits.reduce((a, k) => a + k.quantity, 0),
    0,
  );

  console.log('\n=== Operations snapshot (dashboard "Current state") ===');
  console.log(`  pendingAcknowledgementKits: ${snapshot.pendingAcknowledgementKits}`);
  console.log(`  outstandingKits:          ${snapshot.outstandingKits}`);

  console.log('\n=== Manual recompute from Dispatch collection ===');
  console.log(`  pendingAckTotal:            ${pendingAckTotal}`);
  console.log(`  outstandingTotal:           ${outstandingTotal}`);
  console.log(`  non-Pending dispatch rows:  ${dispatches.length}`);

  console.log('\n=== By dispatch status ===');
  [...byStatus.entries()]
    .sort((a, b) => b[1].pending - a[1].pending)
    .forEach(([status, row]) => {
      console.log(`  ${status}: ${row.count} dispatches, pending=${row.pending}, outstanding=${row.outstanding}`);
    });

  console.log('\n=== By school code bucket (pending kits only) ===');
  [...byCodeBucket.entries()]
    .sort((a, b) => b[1].pending - a[1].pending)
    .forEach(([bucket, row]) => {
      console.log(`  ${bucket}: pending=${row.pending}, schools=${row.schools.size}`);
    });

  console.log('\n=== By spreadsheet cohort (pending kits only) ===');
  console.log(`  Not-ack pending sync (${pendingSchools.length} schools, sheet expects ${expectedPending} kits):`);
  console.log(`    DB pending kits: ${byCohort.pendingCohort.pendingKits} across ${byCohort.pendingCohort.schools.size} schools`);
  console.log(`  Everything else (legacy / FINAL_DATA / old imports):`);
  console.log(`    DB pending kits: ${byCohort.other.pendingKits} across ${byCohort.other.schools.size} schools`);

  console.log('\n=== Top 20 schools by pending acknowledgement kits ===');
  [...topSchools.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, kits]) => console.log(`  ${kits.toString().padStart(6)}  ${name}`));

  const dispatchedOnly = dispatches.filter((d) => d.status === 'Dispatched');
  const dispatchedPending = dispatchedOnly.reduce((s, d) => s + pendingAckKitsOnDispatch(d), 0);
  console.log('\n=== Dispatched-status only ===');
  console.log(`  rows: ${dispatchedOnly.length}`);
  console.log(`  pending kits: ${dispatchedPending}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
