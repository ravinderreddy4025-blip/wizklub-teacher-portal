/**
 * Find which schools/kits account for Excel vs DB quantity gap.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();
require('../src/models/Division');
require('../src/models/Kit');
const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');

const XLSX_PATH = path.join(__dirname, '../data/FINAL_DATA.xlsx');

const BRANCH_ALIASES = {
  'intl bezawada': 'International Bezawada',
  'kaggadsapura 3': 'Kaggadasapura 3',
  yellahanka: 'Yelahanka',
  'raichur-3': 'Raichur 3',
  thiruvanamalai: 'Tiruvannamalai',
  'the future foundation school': 'The Future Foundation School',
};

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function resolveBranchTargetName(branchName) {
  return BRANCH_ALIASES[clean(branchName)] || branchName;
}

function parseKitsPresent(raw) {
  if (!raw || raw === '(none)') return [];
  return raw
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      const m = trimmed.match(/^(.+?)\((\d+)\)$/);
      if (!m) return null;
      return { name: m[1].trim(), quantity: Number(m[2]) };
    })
    .filter(Boolean);
}

function findSchoolByName(allSchools, branchName) {
  const targetName = resolveBranchTargetName(branchName);
  const normBranch = clean(targetName);
  let match = allSchools.find((s) => clean(s.name) === normBranch);
  if (match) return match;
  match = allSchools.find((s) => clean(s.name) === `sri chaitanya-${normBranch}`);
  if (match) return match;
  match = allSchools.find(
    (s) => clean(s.name).includes(normBranch) && normBranch.length >= 5,
  );
  if (match) return match;
  match = allSchools.find(
    (s) => normBranch.includes(clean(s.name)) && clean(s.name).length >= 5,
  );
  return match || null;
}

function loadExcelBySchool() {
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const bySchool = new Map();
  rows.forEach((row) => {
    const keys = Object.keys(row);
    const name = String(row['School Name'] || row[keys[1]] || '').trim();
    const kitsPresent = String(
      row['Kits Present (kit + max qty)'] || row[keys[keys.length - 1]] || '',
    ).trim();
    const kits = parseKitsPresent(kitsPresent);
    const total = kits.reduce((s, k) => s + k.quantity, 0);
    bySchool.set(name, { name, kits, total, kitCount: kits.length });
  });
  return bySchool;
}

(async () => {
  await mongoose.connect(resolveInventoryMongoUri());
  const excelBySchool = loadExcelBySchool();
  const schools = await School.find({}).lean();
  const kits = await Kit.find({}).lean();
  const kitById = new Map(kits.map((k) => [String(k._id), k]));

  let excelMatchedTotal = 0;
  let dbMatchedTotal = 0;
  const gaps = [];

  for (const [excelName, excelRow] of excelBySchool) {
    if (!excelRow.total) continue;
    const school = findSchoolByName(schools, excelName);
    if (!school) {
      gaps.push({ excelName, issue: 'no_db_match', excelTotal: excelRow.total, dbTotal: 0, delta: -excelRow.total });
      continue;
    }

    const invRows = await SchoolInventory.find({ school: school._id }).lean();
    const dbTotal = invRows.reduce((s, r) => s + (r.quantity || 0), 0);
    excelMatchedTotal += excelRow.total;
    dbMatchedTotal += dbTotal;

    if (dbTotal !== excelRow.total) {
      gaps.push({
        excelName,
        dbName: school.name,
        code: school.code,
        excelTotal: excelRow.total,
        dbTotal,
        delta: dbTotal - excelRow.total,
        excelKits: excelRow.kitCount,
        dbLines: invRows.length,
      });
    }
  }

  // DB schools not in Excel with inventory
  let orphanDbTotal = 0;
  let orphanCount = 0;
  for (const school of schools) {
    const invRows = await SchoolInventory.find({ school: school._id, quantity: { $gt: 0 } }).lean();
    if (!invRows.length) continue;
    const matchedExcel = [...excelBySchool.values()].find((r) => {
      const s = findSchoolByName([school], r.name);
      return s && String(s._id) === String(school._id);
    });
    if (!matchedExcel) {
      const t = invRows.reduce((s, r) => s + r.quantity, 0);
      orphanDbTotal += t;
      orphanCount += 1;
      if (t > 0) {
        gaps.push({
          excelName: '(none)',
          dbName: school.name,
          code: school.code,
          excelTotal: 0,
          dbTotal: t,
          delta: t,
          issue: 'db_only_school',
        });
      }
    }
  }

  gaps.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log('Excel total (all rows):', [...excelBySchool.values()].reduce((s, r) => s + r.total, 0));
  console.log('Excel matched to DB schools:', excelMatchedTotal);
  console.log('DB total for matched schools:', dbMatchedTotal);
  console.log('Gap on matched schools:', dbMatchedTotal - excelMatchedTotal);
  console.log('Orphan DB-only schools:', orphanCount, 'units:', orphanDbTotal);

  const dbGrand = await SchoolInventory.aggregate([{ $group: { _id: null, t: { $sum: '$quantity' } } }]);
  console.log('DB SchoolInventory grand total:', dbGrand[0]?.t || 0);

  console.log('\nTop 25 gaps (db - excel):');
  gaps.slice(0, 25).forEach((g) => {
    console.log(
      `  ${g.dbName || g.excelName} (${g.code || '?'}) excel=${g.excelTotal} db=${g.dbTotal} delta=${g.delta >= 0 ? '+' : ''}${g.delta}${g.issue ? ` [${g.issue}]` : ''}`,
    );
  });

  // Kit lines in DB but not parseable from excel for a sample gap school
  const sample = gaps.find((g) => g.delta > 0 && g.excelName && g.excelName !== '(none)');
  if (sample) {
    const school = schools.find((s) => s.code === sample.code);
    const excelRow = excelBySchool.get(sample.excelName);
    const invRows = await SchoolInventory.find({ school: school._id }).populate('kit', 'name kitId').lean();
    console.log(`\nSample school detail: ${sample.dbName}`);
    console.log(`  Excel kits (${excelRow.kitCount}):`, excelRow.kits.map((k) => `${k.name}(${k.quantity})`).slice(0, 5).join('; '), '...');
    console.log(`  DB lines (${invRows.length}):`);
    invRows.slice(0, 8).forEach((r) => {
      console.log(`    ${r.kit?.name}: qty=${r.quantity}`);
    });
  }

  await mongoose.disconnect();
})();
