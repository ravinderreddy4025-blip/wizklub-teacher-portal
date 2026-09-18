/**
 * Delete all kit documents from inventory (repo-root .env Mongo settings).
 *
 *   node scripts/deleteAllKits.js
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const Kit = require('../src/models/Kit');

loadRootEnv();

async function main() {
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    throw new Error('Set MONGO_URI + INVENTORY_MONGO_DB_NAME (or INVENTORY_MONGODB_URI) in repo-root .env');
  }

  await mongoose.connect(uri);
  const before = await Kit.countDocuments();
  const { deletedCount } = await Kit.deleteMany({});
  const after = await Kit.countDocuments();

  console.log(`Deleted kits: ${deletedCount} (before: ${before}, after: ${after})`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
