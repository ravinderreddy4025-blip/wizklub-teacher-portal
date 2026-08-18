/**
 * Check if all spreadsheet schools are mapped and ready for admin "Register all".
 *
 * Usage: node backend/scripts/checkReadyForBulkRegister.js
 *
 * Exit 0 = all 192 mapped (safe to bulk register in admin Schools → Mapped tab)
 * Exit 1 = gaps remain (see wizklub-fix-list.csv)
 */
const fs = require('fs');
const path = require('path');

const verifyJson = path.resolve(__dirname, '../../spreadsheet-wizklub-verification.json');
const fixCsv = path.resolve(__dirname, '../../wizklub-fix-list.csv');

function main() {
  if (!fs.existsSync(verifyJson)) {
    console.error('Run verifySpreadsheetSchools.js first.');
    process.exit(1);
  }

  const { summary } = JSON.parse(fs.readFileSync(verifyJson, 'utf8'));
  const gaps = (summary.notFound || 0) + (summary.foundNotMapped || 0) + (summary.mappedRegionMismatch || 0);

  console.log(JSON.stringify(summary, null, 2));

  if (gaps === 0 && summary.mapped === summary.total) {
    console.log('\nAll spreadsheet schools are mapped in WizKlub.');
    console.log('Next step: Admin → Schools → Mapped tab → "Register all"');
    console.log('Assign Account Managers and portal emails later as needed.');
    process.exit(0);
  }

  console.log(`\nNot ready for bulk register: ${gaps} gap(s) remain.`);
  console.log(`Review: ${fixCsv}`);
  console.log('Send wizklub-fix-list.csv to WizKlub team or wait for master data fixes.');
  process.exit(1);
}

main();
