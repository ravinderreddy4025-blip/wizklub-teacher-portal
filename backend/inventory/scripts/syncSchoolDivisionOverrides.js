/**
 * Apply school division overrides from data/school-division-overrides.json.
 *
 *   node backend/inventory/scripts/syncSchoolDivisionOverrides.js
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { syncSchoolDivisionOverrides } = require('../src/services/schoolDivisionOverrideService');

loadRootEnv();

async function main() {
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    console.error('Set MONGO_URI (+ INVENTORY_MONGO_DB_NAME) or INVENTORY_MONGODB_URI in repo-root .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const result = await syncSchoolDivisionOverrides();
  console.log(
    `Done: ${result.updated} updated, ${result.skipped} already correct, ${result.missing} missing (${result.checked} override rows).`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
