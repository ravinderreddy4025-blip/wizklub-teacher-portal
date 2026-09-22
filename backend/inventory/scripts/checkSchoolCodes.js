const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { resolveInventoryMongoUri } = require('../src/config/loadEnv');
const School = require('../src/models/School');
const { isSpreadsheetSrCode } = require('../src/utils/schoolIdentity');

async function main() {
  await mongoose.connect(resolveInventoryMongoUri());
  const all = await School.find({}).select('name code wizklubSchoolId').lean();
  const srSchools = all.filter((s) => isSpreadsheetSrCode(s.code));
  const banaswadi = all.filter((s) => /banaswadi/i.test(s.name || ''));
  const portalHits = all.filter(
    (s) => String(s.code || '').toLowerCase() === 'beng0010'
      || String(s.wizklubSchoolId || '').toLowerCase() === 'beng0010',
  );

  console.log(JSON.stringify({
    totalSchools: all.length,
    excelSrSchools: srSchools.length,
    portalOnlySchools: all.length - srSchools.length,
    banaswadi,
    portalBeng0010: portalHits,
    note: 'srCode is NOT a Mongo field — API derives it from code (SC-xxx/yy) + wizklubSchoolId',
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
