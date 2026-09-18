/**
 * Verify pending-acknowledgment kit totals from the 2026 not-ack spreadsheets.
 *
 * Usage: node scripts/verifyPendingAckTotals.js
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { pendingAckKitsOnDispatch } = require('../src/utils/operationsKpi');
const {
  loadPendingDispatchRows,
  findSchool,
} = require('./syncCombinedSchoolKitSpreadsheet');

loadRootEnv();

const School = require('../src/models/School');
const Dispatch = require('../src/models/Dispatch');

async function main() {
  const { schools: expectedSchools, stats } = loadPendingDispatchRows();
  const expectedKits = stats.totalKits;

  await mongoose.connect(resolveInventoryMongoUri());

  const allSchools = await School.find({});
  let pendingKits = 0;
  let matchedSchools = 0;
  const missing = [];

  for (const schoolGroup of expectedSchools) {
    const record = findSchool(allSchools, schoolGroup.schoolCode, schoolGroup.schoolName);
    if (!record) {
      missing.push(`${schoolGroup.schoolCode} — ${schoolGroup.schoolName}`);
      continue;
    }

    matchedSchools += 1;
    const dispatches = await Dispatch.find({
      school: record._id,
      status: 'Dispatched',
    }).lean();
    pendingKits += dispatches.reduce((sum, dispatch) => sum + pendingAckKitsOnDispatch(dispatch), 0);
  }

  console.log('\n=== Pending acknowledgment totals ===');
  console.log(`  Schools matched: ${matchedSchools} / ${expectedSchools.length}`);
  console.log(`  Pending kits:    ${pendingKits} (expected ${expectedKits})`);

  if (missing.length) {
    console.log('  Missing schools:');
    missing.forEach((entry) => console.log(`    - ${entry}`));
  }

  const ok = matchedSchools === expectedSchools.length && pendingKits === expectedKits;
  console.log(`  Status:          ${ok ? 'OK' : 'MISMATCH'}`);

  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
