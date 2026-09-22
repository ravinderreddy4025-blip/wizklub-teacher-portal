/**
 * Upsert official warehouse kit catalog from data/component-kits.json.
 * Removes kits not in the catalog. New kits start with warehouseQuantity 0.
 *
 * Usage:
 *   node backend/inventory/scripts/seedComponentKits.js
 *
 * Run manually when the kit catalog JSON changes (not on server start).
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { syncKitCatalog } = require('../src/services/kitCatalogSyncService');

loadRootEnv();

async function main() {
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    console.error('Set MONGO_URI (+ INVENTORY_MONGO_DB_NAME) or INVENTORY_MONGODB_URI in repo-root .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const result = await syncKitCatalog({ prune: true });
  console.log(
    `Done: ${result.created} created, ${result.updated} updated, ${result.removed} removed (${result.synced} catalog rows).`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
