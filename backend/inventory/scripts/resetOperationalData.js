/**
 * Wipe dispatch/receipt/audit operational data. Keeps schools, users, kits, divisions.
 * Restores kit warehouse stock from physical movements that left the warehouse.
 *
 *   node scripts/resetOperationalData.js
 */
const mongoose = require('mongoose');
const { loadRootEnv } = require('../src/config/loadEnv');

loadRootEnv();

const env = require('../src/config/env');
const Dispatch = require('../src/models/Dispatch');
const ReceiptIssue = require('../src/models/ReceiptIssue');
const ReplacementRequest = require('../src/models/ReplacementRequest');
const AuditReport = require('../src/models/AuditReport');
const DivisionAuditWindow = require('../src/models/DivisionAuditWindow');
const Notification = require('../src/models/Notification');
const SchoolInventory = require('../src/models/SchoolInventory');
const Kit = require('../src/models/Kit');

function movementQty(dispatch) {
  if (dispatch.status === 'Pending') return 0;
  const rolled = Number(dispatch.quantityDispatched);
  if (Number.isFinite(rolled) && rolled > 0) return rolled;
  const fromCycles = (dispatch.cycles || []).reduce(
    (sum, cycle) => sum + (Number(cycle.quantityDispatched) || 0),
    0,
  );
  if (fromCycles > 0) return fromCycles;
  return Number(dispatch.quantity) || 0;
}

async function reset() {
  if (!env.mongoUri) {
    throw new Error('Set MONGO_URI + INVENTORY_MONGO_DB_NAME (or MONGODB_URI) before resetting.');
  }

  await mongoose.connect(env.mongoUri);
  console.log(`Connected (${env.mongoDbName})`);

  const dispatches = await Dispatch.find({}).select('kit status quantity quantityDispatched cycles');
  const restoreByKit = new Map();
  for (const dispatch of dispatches) {
    const kitId = String(dispatch.kit || '');
    if (!kitId) continue;
    restoreByKit.set(kitId, (restoreByKit.get(kitId) || 0) + movementQty(dispatch));
  }

  const restored = [];
  for (const [kitId, qty] of restoreByKit.entries()) {
    if (qty <= 0) continue;
    const kit = await Kit.findByIdAndUpdate(kitId, { $inc: { warehouseQuantity: qty } }, { new: true });
    restored.push({ kitId: kit?.kitId || kitId, added: qty, warehouse: kit?.warehouseQuantity });
  }

  const results = {
    dispatches: (await Dispatch.deleteMany({})).deletedCount,
    receiptIssues: (await ReceiptIssue.deleteMany({})).deletedCount,
    replacementRequests: (await ReplacementRequest.deleteMany({})).deletedCount,
    auditReports: (await AuditReport.deleteMany({})).deletedCount,
    auditWindows: (await DivisionAuditWindow.deleteMany({})).deletedCount,
    schoolInventory: (await SchoolInventory.deleteMany({})).deletedCount,
    notifications: (await Notification.deleteMany({})).deletedCount,
  };

  console.log('\nRestored warehouse:');
  if (restored.length === 0) console.log('  (none)');
  restored.forEach((row) => console.log(`  ${row.kitId}: +${row.added} → ${row.warehouse}`));

  console.log('\nDeleted:');
  Object.entries(results).forEach(([key, count]) => console.log(`  ${key}: ${count}`));
  console.log('\nKept: schools, users, kits, divisions');

  await mongoose.disconnect();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
