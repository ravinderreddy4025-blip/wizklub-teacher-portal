/**
 * Shared kit totals for production inventory spreadsheets.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { loadCombinedRows } = require('./syncCombinedAcknowledgedSpreadsheet');

const FINAL_DATA_PATH = path.join(__dirname, '../data/FINAL_DATA.xlsx');
const COMBINED_PATH = path.join(__dirname, '../data/SC_WIZKLUB_Combined_Single_Sheet.xlsx');

const REQUIRED_FILES = [
  '../data/component-kits.json',
  '../data/FINAL_DATA.xlsx',
  '../data/SC_WIZKLUB_Combined_Single_Sheet.xlsx',
];

function parseKitsPresent(raw) {
  if (!raw || raw === '(none)') return [];
  return String(raw)
    .split(';')
    .map((part) => {
      const m = part.trim().match(/^(.+?)\s*\((\d+)\)$/);
      return m ? Number(m[2]) : 0;
    })
    .filter((n) => n > 0);
}

function loadFinalDataTotals() {
  if (!fs.existsSync(FINAL_DATA_PATH)) {
    throw new Error(`FINAL_DATA spreadsheet not found: ${FINAL_DATA_PATH}`);
  }
  const wb = XLSX.readFile(FINAL_DATA_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let totalKits = 0;
  let schoolCount = 0;
  rows.forEach((row) => {
    const keys = Object.keys(row);
    const name = String(row['School Name'] || row[keys[1]] || '').trim();
    if (!name) return;
    const kitsPresent = String(
      row['Kits Present (kit + max qty)'] || row['Total Kit Quantity'] || row[keys[keys.length - 1]] || '',
    ).trim();
    const qtyCol = Number(row['Total Kit Quantity'] || 0);
    const fromString = parseKitsPresent(kitsPresent).reduce((sum, qty) => sum + qty, 0);
    const qty = qtyCol > 0 ? qtyCol : fromString;
    if (qty <= 0) return;
    schoolCount += 1;
    totalKits += qty;
  });
  return { schoolCount, totalKits };
}

function loadCombinedTotals() {
  const { stats } = loadCombinedRows();
  return { schoolCount: stats.schoolCount, totalKits: stats.totalKits };
}

function loadInventorySpreadsheetTotals() {
  const finalData = loadFinalDataTotals();
  const combined = loadCombinedTotals();
  return {
    finalData,
    combined,
    schoolCount: finalData.schoolCount + combined.schoolCount,
    totalKits: finalData.totalKits + combined.totalKits,
  };
}

function assertRequiredInventoryFiles() {
  REQUIRED_FILES.forEach((relPath) => {
    const filePath = path.join(__dirname, relPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required inventory file: ${filePath}`);
    }
  });
}

module.exports = {
  FINAL_DATA_PATH,
  COMBINED_PATH,
  REQUIRED_FILES,
  loadFinalDataTotals,
  loadCombinedTotals,
  loadInventorySpreadsheetTotals,
  assertRequiredInventoryFiles,
};
