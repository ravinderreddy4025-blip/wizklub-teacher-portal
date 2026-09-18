require('../src/config/loadEnv').loadRootEnv();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const { resolveInventoryMongoUri } = require('../src/config/loadEnv');
require('../src/models/Kit');
const School = require('../src/models/School');
const SchoolInventory = require('../src/models/SchoolInventory');

const XLSX_PATH = path.join(__dirname, '../data/FINAL_DATA.xlsx');

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function parseKitsPresent(raw) {
  if (!raw || raw === '(none)') return [];
  return raw.split(';').map((part) => {
    const m = part.trim().match(/^(.+?)\((\d+)\)$/);
    return m ? Number(m[2]) : 0;
  }).filter((n) => n > 0);
}

function loadExcelTotalsBySchoolName() {
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const map = new Map();
  rows.forEach((row) => {
    const keys = Object.keys(row);
    const name = String(row['School Name'] || row[keys[1]] || '').trim();
    const kitsPresent = String(row['Kits Present (kit + max qty)'] || row[keys[keys.length - 1]] || '').trim();
    const total = parseKitsPresent(kitsPresent).reduce((a, b) => a + b, 0);
    map.set(clean(name), { name, total });
  });
  return map;
}

function excelExpectedForSchool(school, excelMap) {
  const candidates = [
    clean(school.name),
    clean(school.name.replace(/^sri chaitanya-/i, '')),
    clean(school.name.replace(/^sri chaitanya /i, '')),
  ];
  for (const key of candidates) {
    if (excelMap.has(key)) return excelMap.get(key).total;
  }
  for (const [key, row] of excelMap) {
    if (key.length >= 5 && (candidates[0].includes(key) || key.includes(candidates[0]))) {
      return row.total;
    }
  }
  return 0;
}

(async () => {
  await mongoose.connect(resolveInventoryMongoUri());
  const excelMap = loadExcelTotalsBySchoolName();
  const schools = await School.find({}).lean();

  let dbTotal = 0;
  let excelExpectedTotal = 0;
  let excessTotal = 0;
  let deficitTotal = 0;
  const rows = [];

  for (const school of schools) {
    const inv = await SchoolInventory.aggregate([
      { $match: { school: school._id } },
      { $group: { _id: null, t: { $sum: '$quantity' } } },
    ]);
    const dbQty = inv[0]?.t || 0;
    if (!dbQty) continue;
    const excelQty = excelExpectedForSchool(school, excelMap);
    dbTotal += dbQty;
    excelExpectedTotal += excelQty;
    const delta = dbQty - excelQty;
    if (delta > 0) excessTotal += delta;
    if (delta < 0) deficitTotal += -delta;
    if (delta !== 0) {
      rows.push({ name: school.name, code: school.code, dbQty, excelQty, delta });
    }
  }

  rows.sort((a, b) => b.delta - a.delta);
  console.log('DB inventory total (schools with qty>0):', dbTotal);
  console.log('Excel expected for those schools:', excelExpectedTotal);
  console.log('Excess (db>excel):', excessTotal);
  console.log('Deficit (excel>db):', deficitTotal);
  console.log('Net gap:', dbTotal - excelExpectedTotal);
  console.log('\nAll schools with delta != 0:');
  rows.forEach((r) => {
    console.log(`  ${r.name} (${r.code}) db=${r.dbQty} excel=${r.excelQty} delta=${r.delta >= 0 ? '+' : ''}${r.delta}`);
  });

  await mongoose.disconnect();
})();
