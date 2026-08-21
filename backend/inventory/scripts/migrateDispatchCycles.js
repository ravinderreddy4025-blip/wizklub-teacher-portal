/**
 * Idempotent: build cycles[] + rollups + trackingHistory from live fields / redispatchCycles.
 * Also seeds ReceiptIssue.claimHistory when empty.
 *
 *   node scripts/migrateDispatchCycles.js
 */
const mongoose = require('mongoose');
const { loadRootEnv } = require('../src/config/loadEnv');

loadRootEnv();

const env = require('../src/config/env');
const Dispatch = require('../src/models/Dispatch');
const ReceiptIssue = require('../src/models/ReceiptIssue');
const {
  hydrateCyclesIfNeeded,
  applyOrderTotals,
  ensureClaimHistory,
} = require('../src/utils/dispatchCycle');

async function migrate() {
  if (!env.mongoUri) {
    throw new Error('Set MONGO_URI + INVENTORY_MONGO_DB_NAME (or MONGODB_URI) before migrating.');
  }

  await mongoose.connect(env.mongoUri);
  console.log(`Connected (${env.mongoDbName})`);

  const dispatches = await Dispatch.find({});
  let dispatchUpdated = 0;
  let dispatchSkipped = 0;

  for (const dispatch of dispatches) {
    const hadCycles = Array.isArray(dispatch.cycles) && dispatch.cycles.length > 0;
    const beforeStatus = dispatch.status;
    const beforeInitial = dispatch.quantityInitial;

    if (dispatch.status === 'Pending') {
      applyOrderTotals(dispatch);
      if (dispatch.isModified()) {
        await dispatch.save();
        dispatchUpdated += 1;
      } else {
        dispatchSkipped += 1;
      }
      continue;
    }

    hydrateCyclesIfNeeded(dispatch);
    const changed = !hadCycles
      || dispatch.status !== beforeStatus
      || dispatch.quantityInitial !== beforeInitial
      || dispatch.isModified();
    if (changed) {
      await dispatch.save();
      dispatchUpdated += 1;
    } else {
      dispatchSkipped += 1;
    }
  }

  const issues = await ReceiptIssue.find({
    $or: [{ claimHistory: { $exists: false } }, { claimHistory: { $size: 0 } }],
  });
  let issueUpdated = 0;
  for (const issue of issues) {
    ensureClaimHistory(issue);
    await issue.save();
    issueUpdated += 1;
  }

  console.log(`Dispatches updated: ${dispatchUpdated}, unchanged: ${dispatchSkipped}`);
  console.log(`Issues seeded with claimHistory: ${issueUpdated}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
