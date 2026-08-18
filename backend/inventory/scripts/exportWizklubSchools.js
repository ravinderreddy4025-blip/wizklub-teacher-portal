/**
 * Export all WizKlub schools to JSON (cursor pagination until has_next_page is false).
 *
 * Usage (from repo root):
 *   WIZKLUB_ADMIN_USERNAME=you WIZKLUB_ADMIN_PASSWORD=secret node backend/scripts/exportWizklubSchools.js
 *
 * Optional:
 *   WIZKLUB_EXPORT_PATH=./wizklub-schools-catalog.json
 */
const fs = require('fs');
const path = require('path');
const { loadRootEnv } = require('../src/config/loadEnv');
const wizklubApi = require('../src/services/wizklubApiService');

loadRootEnv();

async function main() {
  const username = process.env.WIZKLUB_ADMIN_USERNAME?.trim();
  const password = process.env.WIZKLUB_ADMIN_PASSWORD;
  if (!username || !password) {
    console.error('Set WIZKLUB_ADMIN_USERNAME and WIZKLUB_ADMIN_PASSWORD');
    process.exit(1);
  }

  const loginData = await wizklubApi.adminLogin(username, password);
  const parsed = wizklubApi.parseAdminLoginResponse(loginData);
  if (!parsed.hasAdminRole) {
    console.error('Account does not have Admin role');
    process.exit(1);
  }
  if (!parsed.accessToken) {
    console.error('Login did not return access_token');
    process.exit(1);
  }

  const schools = await wizklubApi.listAllSchools(parsed.accessToken, { pageSize: 100 });
  const payload = {
    exportedAt: new Date().toISOString(),
    total: schools.length,
    schools: schools.map((s) => ({
      name: s.name,
      code: s.code || s.id,
      id: s.id,
      email: s.email || null,
    })),
  };

  const outPath = path.resolve(
    process.cwd(),
    process.env.WIZKLUB_EXPORT_PATH || 'wizklub-schools-catalog.json',
  );
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(payload, null, 2));
  console.error(`\nWrote ${payload.total} schools to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
