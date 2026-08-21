const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const env = require('../config/env');
const { logoUrlForEmail } = require('../utils/brandLogo');

let sesClient = null;

function isSesConfigured() {
  return Boolean(
    env.ses.region
    && env.ses.from
    && env.ses.accessKeyId
    && env.ses.secretAccessKey
    && env.ses.amCreatedTemplate
    && env.ses.amResetTemplate
  );
}

function isMailConfigured() {
  return isSesConfigured();
}

function getSesClient() {
  if (!isSesConfigured()) return null;
  if (sesClient) return sesClient;
  sesClient = new SESv2Client({
    region: env.ses.region,
    credentials: {
      accessKeyId: env.ses.accessKeyId,
      secretAccessKey: env.ses.secretAccessKey,
    },
  });
  return sesClient;
}

async function sendCredentialsEmailAsync(sendFn) {
  if (!isSesConfigured()) {
    return {
      sent: false,
      reason: 'Amazon SES is not configured. Set SES_REGION, SES_FROM_EMAIL, AWS_NOTIF_* and template names in .env.',
    };
  }

  try {
    await sendFn();
    return { sent: true, reason: null };
  } catch (err) {
    console.error('[email] Failed to send credentials:', err.message);
    return { sent: false, reason: err.message || 'Failed to send credentials email via SES.' };
  }
}

async function sendSesTemplatedEmail({ to, templateName, data }) {
  const client = getSesClient();
  if (!client) {
    const error = new Error('Amazon SES is not configured');
    error.status = 503;
    throw error;
  }

  await client.send(new SendEmailCommand({
    FromEmailAddress: env.ses.from,
    Destination: { ToAddresses: [to] },
    Content: {
      Template: {
        TemplateName: templateName,
        TemplateData: JSON.stringify(data),
      },
    },
  }));

  return { sent: true };
}

function resolveDivisionNames({ divisionNames, divisionName }) {
  const fromList = Array.isArray(divisionNames)
    ? divisionNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  if (fromList.length) return fromList;
  const single = String(divisionName || '').trim();
  return single ? [single] : [];
}

function formatDivisionList(names) {
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

async function sendAccountManagerCredentialsEmail({
  to,
  name,
  password,
  divisionName,
  divisionNames,
  isRegenerated = false,
}) {
  if (!isSesConfigured()) {
    return {
      sent: false,
      reason: 'Amazon SES is not configured.',
    };
  }

  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/login/am`
    : 'http://localhost:5173/login/am';

  const names = resolveDivisionNames({ divisionNames, divisionName });
  const divisionList = formatDivisionList(names);
  const logoUrl = logoUrlForEmail();

  return sendSesTemplatedEmail({
    to,
    templateName: isRegenerated ? env.ses.amResetTemplate : env.ses.amCreatedTemplate,
    data: {
      name: name || 'Account Manager',
      email: to,
      password,
      division: divisionList,
      login_url: loginUrl,
      logo_url: logoUrl,
    },
  });
}

module.exports = {
  isSesConfigured,
  isMailConfigured,
  sendCredentialsEmailAsync,
  sendAccountManagerCredentialsEmail,
};
