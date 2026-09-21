/**
 * Build-time check: required inventory spreadsheets exist and parse to expected totals.
 * No MongoDB required. Used from backend/combined.Dockerfile.
 */
const fs = require('fs');
const path = require('path');
const {
  assertRequiredInventoryFiles,
  loadInventorySpreadsheetTotals,
} = require('./inventorySpreadsheetTotals');

const EXPECTED_FINAL_SCHOOLS = 164;
const EXPECTED_FINAL_KITS = 41726;
const EXPECTED_COMBINED_SCHOOLS = 36;
const EXPECTED_COMBINED_KITS = 9517;
const EXPECTED_TOTAL_SCHOOLS = EXPECTED_FINAL_SCHOOLS + EXPECTED_COMBINED_SCHOOLS;
const EXPECTED_TOTAL_KITS = EXPECTED_FINAL_KITS + EXPECTED_COMBINED_KITS;

function main() {
  const baseDir = path.join(__dirname, '..');
  assertRequiredInventoryFiles();

  const catalog = JSON.parse(
    fs.readFileSync(path.join(baseDir, 'data/component-kits.json'), 'utf8'),
  );
  if (!Array.isArray(catalog) || !catalog.length) {
    throw new Error('component-kits.json is empty or invalid');
  }

  const totals = loadInventorySpreadsheetTotals();
  const errors = [];
  if (totals.finalData.schoolCount !== EXPECTED_FINAL_SCHOOLS) {
    errors.push(`FINAL_DATA schools: expected ${EXPECTED_FINAL_SCHOOLS}, got ${totals.finalData.schoolCount}`);
  }
  if (totals.finalData.totalKits !== EXPECTED_FINAL_KITS) {
    errors.push(`FINAL_DATA kits: expected ${EXPECTED_FINAL_KITS}, got ${totals.finalData.totalKits}`);
  }
  if (totals.combined.schoolCount !== EXPECTED_COMBINED_SCHOOLS) {
    errors.push(`Combined schools: expected ${EXPECTED_COMBINED_SCHOOLS}, got ${totals.combined.schoolCount}`);
  }
  if (totals.combined.totalKits !== EXPECTED_COMBINED_KITS) {
    errors.push(`Combined kits: expected ${EXPECTED_COMBINED_KITS}, got ${totals.combined.totalKits}`);
  }
  if (errors.length) {
    throw new Error(errors.join('; '));
  }

  console.log(
    `Inventory spreadsheets OK: ${catalog.length} kit catalog rows; `
    + `FINAL_DATA ${totals.finalData.schoolCount} schools / ${totals.finalData.totalKits} kits (ack); `
    + `combined ${totals.combined.schoolCount} schools / ${totals.combined.totalKits} kits (ack); `
    + `total ${EXPECTED_TOTAL_SCHOOLS} schools / ${EXPECTED_TOTAL_KITS} kits`,
  );
}

main();
