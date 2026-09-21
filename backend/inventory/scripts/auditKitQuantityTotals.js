/**
 * Reconcile Excel kit totals vs DB (SchoolInventory, Dispatch, Operations KPI).
 * Usage: node scripts/auditKitQuantityTotals.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const monthlyReportService = require('../src/services/monthlyReportService');

loadRootEnv();

require('../src/models/Division');
require('../src/models/Kit');
require('../src/models/AuditReport');
require('../src/models/ReceiptIssue');
require('../src/models/ReplacementRequest');
const School = require('../src/models/School');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');

const XLSX_PATH = path.join(__dirname, '../data/FINAL_DATA.xlsx');

function parseKitsPresent(raw) {
  if (!raw || raw === '(none)') return [];
  return raw
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      const m = trimmed.match(/^(.+?)\s*\((\d+)\)$/);
      if (!m) return null;
      return { name: m[1].trim(), quantity: Number(m[2]) };
    })
    .filter(Boolean);
}

function loadExcelTotal() {
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let total = 0;
  let rowsWithKits = 0;
  rows.forEach((row) => {
    const keys = Object.keys(row);
    const kitsPresent = String(
      row['Kits Present (kit + max qty)'] || row[keys[keys.length - 1]] || '',
    ).trim();
    const kits = parseKitsPresent(kitsPresent);
    if (kits.length) rowsWithKits += 1;
    kits.forEach((k) => { total += k.quantity; });
  });
  return { total, schoolRows: rows.length, rowsWithKits };
}

async function main() {
  await mongoose.connect(resolveInventoryMongoUri());

  const excel = loadExcelTotal();
  console.log('\n=== EXCEL (FINAL_DATA.xlsx) ===');
  console.log(`  School rows:     ${excel.schoolRows}`);
  console.log(`  Rows with kits:  ${excel.rowsWithKits}`);
  console.log(`  Total kit units: ${excel.total}`);

  const invAgg = await SchoolInventory.aggregate([
    { $group: { _id: null, total: { $sum: '$quantity' }, lines: { $sum: 1 } } },
  ]);
  const invTotal = invAgg[0]?.total || 0;
  const invLines = invAgg[0]?.lines || 0;

  console.log('\n=== SchoolInventory (DB) ===');
  console.log(`  Lines:           ${invLines}`);
  console.log(`  Total quantity:  ${invTotal}`);
  console.log(`  vs Excel:        ${invTotal - excel.total >= 0 ? '+' : ''}${invTotal - excel.total}`);

  const dispatchAgg = await Dispatch.aggregate([
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        qty: { $sum: '$quantity' },
        qtyReceived: { $sum: { $ifNull: ['$quantityReceived', '$quantity'] } },
        qtyAck: { $sum: { $ifNull: ['$quantityAcknowledged', 0] } },
      },
    },
  ]);
  const d = dispatchAgg[0] || {};
  console.log('\n=== Dispatch (DB) ===');
  console.log(`  Records:         ${d.count || 0}`);
  console.log(`  Sum quantity:    ${d.qty || 0}`);
  console.log(`  Sum received:    ${d.qtyReceived || 0}`);
  console.log(`  Sum acknowledged:${d.qtyAck || 0}`);
  console.log(`  vs Excel:        ${(d.qty || 0) - excel.total >= 0 ? '+' : ''}${(d.qty || 0) - excel.total}`);

  const cycleAgg = await Dispatch.aggregate([
    { $unwind: { path: '$cycles', preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: '$cycles.movementType',
        lines: { $sum: 1 },
        dispatched: { $sum: { $ifNull: ['$cycles.quantityDispatched', 0] } },
        acknowledged: { $sum: { $ifNull: ['$cycles.quantityAcknowledged', 0] } },
      },
    },
  ]);
  console.log('\n=== Dispatch cycles by movementType ===');
  cycleAgg.forEach((row) => {
    console.log(`  ${row._id || 'null'}: lines=${row.lines} dispatched=${row.dispatched} ack=${row.acknowledged}`);
  });

  const month = monthlyReportService.currentMonth();
  const report = await monthlyReportService.getMonthlyReport(month);
  console.log(`\n=== Operations KPI (month ${month}) ===`);
  console.log(`  sentKits:          ${report.summary.sentKits}`);
  console.log(`  acknowledgedKits:  ${report.summary.acknowledgedKits}`);
  console.log(`  replacedKits:      ${report.summary.replacedKits}`);
  console.log(`  pendingKits:       ${report.summary.pendingKits}`);

  // Mismatch: dispatch qty != schoolInventory for same school+kit
  const mismatches = await Dispatch.aggregate([
    {
      $lookup: {
        from: 'schoolinventories',
        let: { sid: '$school', kid: '$kit' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$school', '$$sid'] }, { $eq: ['$kit', '$$kid'] }] } } },
        ],
        as: 'inv',
      },
    },
    { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        school: 1,
        kit: 1,
        dispatchQty: '$quantity',
        invQty: { $ifNull: ['$inv.quantity', -1] },
        delta: { $subtract: ['$quantity', { $ifNull: ['$inv.quantity', 0] }] },
      },
    },
    { $match: { delta: { $ne: 0 } } },
    { $sort: { delta: -1 } },
    { $limit: 20 },
  ]);

  console.log('\n=== Top dispatch vs SchoolInventory mismatches (dispatch - inventory) ===');
  for (const row of mismatches) {
    const school = await School.findById(row.school).select('name code').lean();
    console.log(`  ${school?.name || row.school}: dispatch=${row.dispatchQty} inv=${row.invQty} delta=${row.delta}`);
  }
  const mismatchSum = await Dispatch.aggregate([
    {
      $lookup: {
        from: 'schoolinventories',
        let: { sid: '$school', kid: '$kit' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$school', '$$sid'] }, { $eq: ['$kit', '$$kid'] }] } } },
        ],
        as: 'inv',
      },
    },
    { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        excess: {
          $sum: {
            $max: [0, { $subtract: ['$quantity', { $ifNull: ['$inv.quantity', 0] }] }],
          },
        },
        deficit: {
          $sum: {
            $max: [0, { $subtract: [{ $ifNull: ['$inv.quantity', 0] }, '$quantity'] }],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  const mm = mismatchSum[0] || {};
  console.log(`  Total excess dispatch over inv: +${mm.excess || 0}`);
  console.log(`  Total deficit (inv > dispatch): -${mm.deficit || 0}`);

  // Duplicate dispatches per school+kit
  const dupes = await Dispatch.aggregate([
    { $group: { _id: { school: '$school', kit: '$kit' }, count: { $sum: 1 }, qty: { $sum: '$quantity' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  console.log('\n=== Duplicate dispatch rows (same school+kit) ===');
  if (!dupes.length) console.log('  None');
  for (const row of dupes) {
    const school = await School.findById(row._id.school).select('name').lean();
    console.log(`  ${school?.name}: ${row.count} rows, sum qty=${row.qty}`);
  }
  const dupeExtra = await Dispatch.aggregate([
    { $group: { _id: { school: '$school', kit: '$kit' }, count: { $sum: 1 }, qty: { $sum: '$quantity' }, maxQty: { $max: '$quantity' } } },
    { $match: { count: { $gt: 1 } } },
    { $group: { _id: null, extraUnits: { $sum: { $subtract: ['$qty', '$maxQty'] } }, groups: { $sum: 1 } } },
  ]);
  console.log(`  Extra units from duplicates: ${dupeExtra[0]?.extraUnits || 0} (${dupeExtra[0]?.groups || 0} school+kit groups)`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
