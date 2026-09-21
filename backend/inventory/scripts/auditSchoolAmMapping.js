/**
 * Audit school rmId (Account Manager) mapping vs FINAL_DATA.xlsx
 * Usage: node scripts/auditSchoolAmMapping.js
 */
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();

require('../src/models/Division');
const School = require('../src/models/School');
const User = require('../src/models/User');
const Division = require('../src/models/Division');

function clean(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  await mongoose.connect(resolveInventoryMongoUri());
  const ilDiv = await Division.findOne({ name: /^IL School$/i }).lean();
  const ilSchools = await School.find({ divisionId: ilDiv._id }).populate('rmId', 'name email').lean();
  const withAm = ilSchools.filter((s) => s.rmId);
  const noAm = ilSchools.filter((s) => !s.rmId);

  console.log(`IL total: ${ilSchools.length}, with rmId: ${withAm.length}, without: ${noAm.length}`);
  if (withAm.length) {
    console.log('WITH AM:');
    withAm.forEach((s) => console.log(`  - ${s.name} (${s.code}) → ${s.rmId.name}`));
  }
  if (noAm.length) {
    console.log('NO AM:');
    noAm.forEach((s) => console.log(`  - ${s.name} (${s.code})`));
  }

  const wb = XLSX.readFile(path.join(__dirname, '../data/FINAL_DATA.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const ilExcel = rows.filter((r) => clean(r['Region']) === 'il school');
  console.log(`\nExcel IL rows: ${ilExcel.length}`);
  ilExcel.forEach((r) => console.log(`  - ${r['School Name']} | ${r['School ID']} | AM: ${r['Account Manager']}`));

  const allNoRm = await School.find({ $or: [{ rmId: null }, { rmId: { $exists: false } }] })
    .populate('divisionId', 'name')
    .lean();
  console.log(`\nTotal schools missing rmId: ${allNoRm.length}`);
  allNoRm.forEach((s) => console.log(`  - ${s.name} (${s.code}) | ${s.divisionId?.name}`));

  const amUsers = await User.find({ role: 'AM' }).lean();
  console.log('\nAM users:');
  amUsers.forEach((u) => console.log(`  - ${u.name} (${u.email})`));

  const excelWithAm = rows.filter((r) => String(r['Account Manager'] || '').trim());
  const ilExcelWithAm = excelWithAm.filter((r) => clean(r['Region']) === 'il school');
  console.log(`\nExcel rows with AM: ${excelWithAm.length}, IL region with AM: ${ilExcelWithAm.length}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
