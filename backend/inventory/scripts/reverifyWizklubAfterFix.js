/**
 * After WizKlub updates master data: re-export live API, re-verify spreadsheet, report readiness.
 *
 * Usage:
 *   WIZKLUB_ADMIN_USERNAME=... WIZKLUB_ADMIN_PASSWORD=... node backend/scripts/reverifyWizklubAfterFix.js
 *
 * Skips live export if WIZKLUB_ADMIN_USERNAME is not set (uses existing wizklub-schools-all.json).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const verifyJson = path.join(root, 'spreadsheet-wizklub-verification.json');

function runNode(script, args = []) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function main() {
  const username = process.env.WIZKLUB_ADMIN_USERNAME?.trim();
  const password = process.env.WIZKLUB_ADMIN_PASSWORD;

  if (username && password) {
    console.log('Step 1/3: Exporting live WizKlub schools from API…');
    runNode(path.join(__dirname, 'exportWizklubSchoolsByRegion.js'));
  } else {
    console.log('Step 1/3: Skipping live export (set WIZKLUB_ADMIN_USERNAME and WIZKLUB_ADMIN_PASSWORD to refresh from API).');
    console.log(`Using existing ${path.join(root, 'wizklub-schools-all.json')}`);
  }

  console.log('\nStep 2/3: Re-verifying spreadsheet against catalog…');
  runNode(path.join(__dirname, 'verifySpreadsheetSchools.js'));

  console.log('\nStep 3/3: Checking bulk-register readiness…');
  runNode(path.join(__dirname, 'checkReadyForBulkRegister.js'));

  if (fs.existsSync(verifyJson)) {
    const { summary } = JSON.parse(fs.readFileSync(verifyJson, 'utf8'));
    console.log('\n--- Re-verification complete ---');
    console.log(JSON.stringify(summary, null, 2));
  }
}

main();
