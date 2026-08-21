/**
 * Read-only snapshot of migrated dispatch rollups.
 *   node scripts/inspectDispatchCycles.js
 */
const mongoose = require('mongoose');
const { loadRootEnv } = require('../src/config/loadEnv');

loadRootEnv();

const env = require('../src/config/env');
const Dispatch = require('../src/models/Dispatch');

(async () => {
  await mongoose.connect(env.mongoUri);
  const total = await Dispatch.countDocuments();
  const withCycles = await Dispatch.countDocuments({ 'cycles.0': { $exists: true } });
  const byStatus = await Dispatch.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  const sample = await Dispatch.find({ 'cycles.0': { $exists: true } })
    .select('dispatchId status quantity quantityInitial quantityAcknowledged quantityAffected quantityReplaced outstandingQuantity cycles')
    .lean();

  const rows = sample.map((d) => ({
    id: d.dispatchId,
    status: d.status,
    initial: d.quantityInitial,
    ack: d.quantityAcknowledged,
    affected: d.quantityAffected,
    replaced: d.quantityReplaced,
    outstanding: d.outstandingQuantity,
    cycles: (d.cycles || []).map((c) => `${c.movementType} ${c.quantityDispatched}/${c.quantityAcknowledged}/${c.quantityAffected}`),
  }));

  console.log(JSON.stringify({ total, withCycles, byStatus, rows }, null, 2));
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
