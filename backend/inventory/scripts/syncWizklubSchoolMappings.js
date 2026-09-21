/**
 * Link inventory schools (SR codes from Excel) to WizKlub portal login ids (API).
 *
 * Usage:
 *   node scripts/syncWizklubSchoolMappings.js
 *   node scripts/syncWizklubSchoolMappings.js --commit
 */

const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { syncWizklubSchoolMappings } = require('../src/services/wizklubSchoolMappingService');

loadRootEnv();

const COMMIT = process.argv.includes('--commit');

async function main() {
  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) throw new Error('No MONGODB_URI / MONGO_URI found.');

  await mongoose.connect(mongoUri);
  console.log(`WizKlub school mapping — ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

  const result = await syncWizklubSchoolMappings({
    commit: COMMIT,
    log: (msg) => console.log(msg),
  });

  console.log('\nSummary:', result);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
