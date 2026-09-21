/**
 * Production startup: keep school kit totals aligned with inventory spreadsheets.
 *
 * Sources (both acknowledged):
 *   - backend/inventory/data/FINAL_DATA.xlsx
 *   - backend/inventory/data/SC_WIZKLUB_Combined_Single_Sheet.xlsx
 *
 * Usage:
 *   node scripts/ensureExcelInventorySync.js
 *   node scripts/ensureExcelInventorySync.js --commit
 */
const { spawnSync } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { loadInventorySpreadsheetTotals } = require('./inventorySpreadsheetTotals');

loadRootEnv();

const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');

const COMMIT = process.argv.includes('--commit');
const FORCE_REBUILD = ['1', 'true', 'yes'].includes(
  String(process.env.INVENTORY_REBUILD_FROM_EXCEL || '').trim().toLowerCase(),
);

function log(msg) {
  console.log(msg);
}

async function loadDbTotals() {
  const [invAgg, dispAgg] = await Promise.all([
    SchoolInventory.aggregate([{ $group: { _id: null, total: { $sum: '$quantity' } } }]),
    Dispatch.aggregate([{ $group: { _id: null, total: { $sum: '$quantity' } } }]),
  ]);
  return {
    inventory: invAgg[0]?.total || 0,
    dispatch: dispAgg[0]?.total || 0,
  };
}

function runNodeScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status}`);
  }
}

async function main() {
  log(`Ensure Excel inventory sync — ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

  const spreadsheetTotals = loadInventorySpreadsheetTotals();
  const excelTotal = spreadsheetTotals.totalKits;
  log(`Excel kit total (FINAL_DATA + combined): ${excelTotal}`);
  log(`  FINAL_DATA: ${spreadsheetTotals.finalData.schoolCount} schools, ${spreadsheetTotals.finalData.totalKits} kits`);
  log(`  Combined:   ${spreadsheetTotals.combined.schoolCount} schools, ${spreadsheetTotals.combined.totalKits} kits`);

  await mongoose.connect(resolveInventoryMongoUri());
  const before = await loadDbTotals();
  await mongoose.disconnect();

  log(`DB SchoolInventory total: ${before.inventory}`);
  log(`DB Dispatch total:       ${before.dispatch}`);

  const drifted = before.inventory !== excelTotal || before.dispatch !== excelTotal;
  const needsFullRebuild = FORCE_REBUILD || drifted;

  if (!COMMIT) {
    if (needsFullRebuild) {
      log(`Would full-rebuild (drift=${drifted}, force=${FORCE_REBUILD})`);
    } else {
      log('Would run incremental spreadsheet sync for FINAL_DATA + combined');
    }
    return;
  }

  if (needsFullRebuild) {
    if (FORCE_REBUILD) {
      log('INVENTORY_REBUILD_FROM_EXCEL enabled — wiping dispatch/inventory and rebuilding from spreadsheets');
    } else {
      log(`Inventory drift detected (excel=${excelTotal}, inv=${before.inventory}, dispatch=${before.dispatch}) — full rebuild`);
    }
    runNodeScript('repairExcelInventoryTotals.js', ['--commit']);
  } else {
    log('Totals already match spreadsheets — running incremental sync');
    runNodeScript('syncFinalDataSpreadsheet.js', ['--commit']);
    runNodeScript('syncCombinedAcknowledgedSpreadsheet.js', ['--commit']);
  }

  await mongoose.connect(resolveInventoryMongoUri());
  const after = await loadDbTotals();
  await mongoose.disconnect();

  log(`After — SchoolInventory: ${after.inventory}, Dispatch: ${after.dispatch}, Excel: ${excelTotal}`);
  if (after.inventory !== excelTotal || after.dispatch !== excelTotal) {
    throw new Error(
      `Inventory still misaligned after sync (excel=${excelTotal}, inv=${after.inventory}, dispatch=${after.dispatch})`,
    );
  }
  log('Inventory totals verified against FINAL_DATA + combined spreadsheets');
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
