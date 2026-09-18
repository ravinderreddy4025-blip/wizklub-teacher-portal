/**
 * Wipe school dispatch/inventory data and rebuild from production spreadsheets.
 *
 * Sources (both acknowledged):
 *   - FINAL_DATA.xlsx
 *   - SC_WIZKLUB_Combined_Single_Sheet.xlsx
 *
 * Usage:
 *   node scripts/repairExcelInventoryTotals.js              # dry-run counts
 *   node scripts/repairExcelInventoryTotals.js --commit     # wipe + re-sync
 */
const { spawnSync } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();

const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');
const School = require('../src/models/School');

const COMMIT = process.argv.includes('--commit');

function log(msg) {
  console.log(msg);
}

async function sumInventory() {
  const agg = await SchoolInventory.aggregate([
    { $group: { _id: null, total: { $sum: '$quantity' }, lines: { $sum: 1 } } },
  ]);
  return { total: agg[0]?.total || 0, lines: agg[0]?.lines || 0 };
}

async function sumDispatches() {
  const agg = await Dispatch.aggregate([
    { $group: { _id: null, total: { $sum: '$quantity' }, lines: { $sum: 1 } } },
  ]);
  return { total: agg[0]?.total || 0, lines: agg[0]?.lines || 0 };
}

function runSync(scriptName) {
  const syncScript = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [syncScript, '--commit'], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status}`);
  }
}

async function main() {
  log(`Repair Excel inventory totals — ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
  await mongoose.connect(resolveInventoryMongoUri());

  const beforeInv = await sumInventory();
  const beforeDisp = await sumDispatches();
  log(`Before — SchoolInventory: ${beforeInv.total} units (${beforeInv.lines} lines)`);
  log(`Before — Dispatch:       ${beforeDisp.total} units (${beforeDisp.lines} lines)`);

  if (!COMMIT) {
    log('\nWould delete all School + Dispatch + SchoolInventory rows, then run:');
    log('  syncFinalDataSpreadsheet.js --commit');
    log('  syncCombinedAcknowledgedSpreadsheet.js --commit');
    await mongoose.disconnect();
    return;
  }

  const schoolResult = await School.deleteMany({});
  const dispResult = await Dispatch.deleteMany({});
  const invResult = await SchoolInventory.deleteMany({});
  log(`\nDeleted ${schoolResult.deletedCount} school row(s)`);
  log(`Deleted ${dispResult.deletedCount} dispatch row(s)`);
  log(`Deleted ${invResult.deletedCount} school inventory row(s)`);
  await mongoose.disconnect();

  log('\nRebuilding from FINAL_DATA.xlsx…');
  runSync('syncFinalDataSpreadsheet.js');

  log('\nRebuilding from SC_WIZKLUB_Combined_Single_Sheet.xlsx…');
  runSync('syncCombinedAcknowledgedSpreadsheet.js');

  await mongoose.connect(resolveInventoryMongoUri());
  const afterInv = await sumInventory();
  const afterDisp = await sumDispatches();
  log(`\nAfter — SchoolInventory: ${afterInv.total} units (${afterInv.lines} lines)`);
  log(`After — Dispatch:       ${afterDisp.total} units (${afterDisp.lines} lines)`);

  const auditScript = path.join(__dirname, 'auditKitQuantityTotals.js');
  spawnSync(process.execPath, [auditScript], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
