/**
 * Push inventory AM SES templates to AWS (updates Html with proper markup).
 * Usage: node scripts/deploySesTemplates.js
 */
const fs = require('fs');
const path = require('path');
const { SESv2Client, UpdateEmailTemplateCommand } = require('@aws-sdk/client-sesv2');
const env = require('../src/config/env');
const { buildAmCreatedHtml, buildAmResetHtml } = require('../src/templates/amCredentialsSesHtml');

const repoRoot = path.resolve(__dirname, '../../..');
const docsDir = path.join(repoRoot, 'docs/ses');

const templates = [
  {
    file: 'WIZ_INVENTORY_AM_CREDENTIALS_TEMPLATE.json',
    buildHtml: buildAmCreatedHtml,
  },
  {
    file: 'WIZ_INVENTORY_AM_PASSWORD_RESET_TEMPLATE.json',
    buildHtml: buildAmResetHtml,
  },
];

async function main() {
  if (!env.ses.region || !env.ses.accessKeyId || !env.ses.secretAccessKey) {
    console.error('SES credentials missing in .env');
    process.exit(1);
  }

  const client = new SESv2Client({
    region: env.ses.region,
    credentials: {
      accessKeyId: env.ses.accessKeyId,
      secretAccessKey: env.ses.secretAccessKey,
    },
  });

  for (const { file, buildHtml } of templates) {
    const filePath = path.join(docsDir, file);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    payload.TemplateContent.Html = buildHtml();

    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 4)}\n`);

    await client.send(new UpdateEmailTemplateCommand(payload));
    console.log(`Updated SES template: ${payload.TemplateName}`);
  }

  console.log('\nDone. Re-send a test: node scripts/checkSesMail.js --send your@email.com');
}

main().catch((error) => {
  console.error('Deploy failed:', error.message);
  process.exit(1);
});
