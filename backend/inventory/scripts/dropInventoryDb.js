/**
 * Drop the entire inventory MongoDB database (from repo-root .env).
 *
 *   node scripts/dropInventoryDb.js
 *
 * Uses MONGO_URI + INVENTORY_MONGO_DB_NAME (or INVENTORY_MONGODB_URI).
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();

async function main() {
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    throw new Error('Set MONGO_URI + INVENTORY_MONGO_DB_NAME (or INVENTORY_MONGODB_URI) in repo-root .env');
  }

  const dbName = uri.split('/').pop().split('?')[0];
  console.log(`Connecting to inventory DB: ${dbName}`);

  await mongoose.connect(uri);
  const name = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  console.log(`Dropped inventory DB: ${name}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
