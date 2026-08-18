/**
 * Sync WizKlub regions → inventory divisions (CLI dry-run or apply).
 *
 * Usage:
 *   node backend/scripts/syncWizklubRegions.js              # dry-run
 *   node backend/scripts/syncWizklubRegions.js --apply        # create missing divisions
 *
 * Requires WIZKLUB_ADMIN_USERNAME / WIZKLUB_ADMIN_PASSWORD and MongoDB (root .env).
 */
const mongoose = require('mongoose');
const { loadRootEnv } = require('../src/config/loadEnv');
const wizklubApi = require('../src/services/wizklubApiService');
const wizklubRegionService = require('../src/services/wizklubRegionService');
const connectDatabase = require('../src/config/database');

loadRootEnv();

async function main() {
  const apply = process.argv.includes('--apply');
  const username = process.env.WIZKLUB_ADMIN_USERNAME?.trim();
  const password = process.env.WIZKLUB_ADMIN_PASSWORD;
  if (!username || !password) {
    console.error('Set WIZKLUB_ADMIN_USERNAME and WIZKLUB_ADMIN_PASSWORD');
    process.exit(1);
  }

  await connectDatabase();

  const loginData = await wizklubApi.adminLogin(username, password);
  const parsed = wizklubApi.parseAdminLoginResponse(loginData);
  if (!parsed.hasAdminRole || !parsed.accessToken) {
    console.error('Admin login failed or missing access token');
    process.exit(1);
  }

  const schools = await wizklubApi.listAllSchools(parsed.accessToken, { pageSize: 100 });
  const regions = wizklubRegionService.extractUniqueRegions(schools);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    totalSchools: schools.length,
    uniqueRegions: regions.length,
    regions: regions.map((r) => ({
      wizklubRegionId: r.wizklubRegionId,
      wizklubRegionName: r.wizklubRegionName,
      schoolCount: r.schoolCount,
    })),
  }, null, 2));

  if (!apply) {
    console.log('\nRe-run with --apply to create divisions for unmapped regions.');
    await mongoose.disconnect();
    return;
  }

  const result = await wizklubRegionService.syncRegionsFromSchools(schools);
  console.log(JSON.stringify({
    regionsFound: result.regionsFound,
    created: result.created,
    matchedCount: result.matched.length,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
