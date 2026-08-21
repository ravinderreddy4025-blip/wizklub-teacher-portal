/**
 * Verify inventory AM credential mail goes through Amazon SES.
 * Usage: node scripts/checkSesMail.js [--send test@example.com]
 */
const { SESv2Client, GetEmailTemplateCommand } = require('@aws-sdk/client-sesv2');
const env = require('../src/config/env');
const {
  isSesConfigured,
  sendAccountManagerCredentialsEmail,
} = require('../src/services/emailService');

function mask(value) {
  const s = String(value || '');
  if (s.length <= 8) return s ? '***' : '(empty)';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function checkTemplates(client) {
  const names = [env.ses.amCreatedTemplate, env.ses.amResetTemplate];
  const results = [];

  for (const name of names) {
    try {
      const res = await client.send(new GetEmailTemplateCommand({ TemplateName: name }));
      results.push({ name, ok: true, subject: res.TemplateContent?.Subject });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }

  return results;
}

async function main() {
  const sendTo = process.argv.includes('--send')
    ? process.argv[process.argv.indexOf('--send') + 1]
    : null;

  console.log('=== Inventory SES mail check ===\n');
  console.log('SES configured:', isSesConfigured());
  console.log('Active path for AM credentials: Amazon SES (templated only)\n');

  if (!isSesConfigured()) {
    console.error('SES is not fully configured. Required: SES_REGION, SES_FROM_EMAIL, AWS_NOTIF_ACCESS_KEY, AWS_NOTIF_SECRET_KEY, SES_AM_* templates.');
    process.exit(1);
  }

  console.log('Region:', env.ses.region);
  console.log('From:', env.ses.from);
  console.log('Access key:', mask(env.ses.accessKeyId));
  console.log('Created template:', env.ses.amCreatedTemplate);
  console.log('Reset template:', env.ses.amResetTemplate);
  console.log('FRONTEND_URL:', process.env.FRONTEND_URL || '(not set)');
  console.log('WIZKLUB_LOGO_PATH:', process.env.WIZKLUB_LOGO_PATH || '(not set)');
  const { logoUrlForEmail } = require('../src/utils/brandLogo');
  console.log('Email logo_url:', logoUrlForEmail() || '(empty — set FRONTEND_URL)');
  console.log('');

  const client = new SESv2Client({
    region: env.ses.region,
    credentials: {
      accessKeyId: env.ses.accessKeyId,
      secretAccessKey: env.ses.secretAccessKey,
    },
  });

  console.log('Checking SES templates in AWS…');
  const templates = await checkTemplates(client);
  templates.forEach((t) => {
    if (t.ok) {
      console.log(`  OK  ${t.name} — subject: ${t.subject}`);
    } else {
      console.log(`  FAIL ${t.name} — ${t.error}`);
    }
  });

  const missingTemplate = templates.some((t) => !t.ok);
  if (missingTemplate) {
    console.log('\nTemplates missing in SES. Create them from docs/ses/*.json before mail will send.');
    process.exit(2);
  }

  if (!sendTo) {
    console.log('\nConfig and templates look usable. To send a real test AM email:');
    console.log('  node scripts/checkSesMail.js --send your-email@wizklub.com');
    return;
  }

  console.log(`\nSending test AM credentials email via SES to ${sendTo}…`);
  const result = await sendAccountManagerCredentialsEmail({
    to: sendTo,
    name: 'SES Test',
    password: 'TestPassword123!',
    divisionName: 'Test Division',
    isRegenerated: false,
  });
  console.log('Send result:', result);
  console.log('Check inbox (and spam) for mail from', env.ses.from);
}

main().catch((error) => {
  console.error('\nSES check failed:', error.message);
  if (error.name) console.error('Error name:', error.name);
  process.exit(1);
});
