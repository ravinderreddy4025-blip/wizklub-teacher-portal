/**
 * Export WizKlub schools split by region assignment.
 *
 * Usage:
 *   WIZKLUB_ADMIN_USERNAME=you WIZKLUB_ADMIN_PASSWORD=secret node backend/scripts/exportWizklubSchoolsByRegion.js
 */
const fs = require('fs');
const path = require('path');
const { loadRootEnv } = require('../src/config/loadEnv');
const wizklubApi = require('../src/services/wizklubApiService');
const { extractUniqueRegions } = require('../src/services/wizklubRegionService');

loadRootEnv();

function hasRegionAssignment(school) {
  const hasRegionId = school.region_id != null && school.region_id !== 0;
  const hasRegionName = Boolean(school.region && String(school.region).trim());
  return hasRegionId || hasRegionName;
}

function toExportRow(school) {
  return {
    id: String(school.id || school.code),
    name: school.name,
    region_id: school.region_id ?? null,
    region: school.region ?? null,
  };
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const username = process.env.WIZKLUB_ADMIN_USERNAME?.trim();
  const password = process.env.WIZKLUB_ADMIN_PASSWORD;
  if (!username || !password) {
    console.error('Set WIZKLUB_ADMIN_USERNAME and WIZKLUB_ADMIN_PASSWORD');
    process.exit(1);
  }

  const loginData = await wizklubApi.adminLogin(username, password);
  const parsed = wizklubApi.parseAdminLoginResponse(loginData);
  if (!parsed.hasAdminRole || !parsed.accessToken) {
    console.error('Admin login failed or missing access token');
    process.exit(1);
  }

  const schools = await wizklubApi.listAllSchools(parsed.accessToken, { pageSize: 100 });
  const withRegion = schools.filter(hasRegionAssignment).map(toExportRow);
  const withoutRegion = schools.filter((s) => !hasRegionAssignment(s)).map(toExportRow);

  const outDir = path.resolve(process.cwd(), process.env.WIZKLUB_EXPORT_DIR || '..');
  const exportedAt = new Date().toISOString();

  const allPayload = {
    exportedAt,
    total: schools.length,
    schools: schools.map(toExportRow),
  };
  const withRegionPayload = {
    exportedAt,
    total: withRegion.length,
    schools: withRegion,
  };
  const withoutRegionPayload = {
    exportedAt,
    total: withoutRegion.length,
    schools: withoutRegion,
  };

  const allPath = path.join(outDir, 'wizklub-schools-all.json');
  const withRegionPath = path.join(outDir, 'wizklub-schools-with-region.json');
  const withoutRegionPath = path.join(outDir, 'wizklub-schools-no-region.json');
  const regionsPath = path.join(outDir, 'wizklub-regions-unique.json');

  const uniqueRegions = extractUniqueRegions(schools);
  const regionsPayload = {
    exportedAt,
    total: uniqueRegions.length,
    regions: uniqueRegions,
  };

  writeJson(allPath, allPayload);
  writeJson(withRegionPath, withRegionPayload);
  writeJson(withoutRegionPath, withoutRegionPayload);
  writeJson(regionsPath, regionsPayload);

  console.log(JSON.stringify({
    exportedAt,
    total: schools.length,
    withRegion: withRegion.length,
    withoutRegion: withoutRegion.length,
    uniqueRegions: uniqueRegions.length,
    files: {
      all: allPath,
      withRegion: withRegionPath,
      withoutRegion: withoutRegionPath,
      regions: regionsPath,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
