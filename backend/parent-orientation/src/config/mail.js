/**
 * Outbound email for School health follow-ups (delegations + action-item reminders).
 *
 * Off unless HEALTH_EMAIL_ENABLED=1 AND an SMTP host + sender are set, so local/dev never sends by accident.
 * Works with any SMTP relay (AWS SES SMTP, Google Workspace relay, SendGrid SMTP, Mailgun …).
 */
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v == null ? '' : v).trim());

function mailConfig(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const port = Number(env.SMTP_PORT) || 587;
  const from = String(env.HEALTH_EMAIL_FROM || env.SMTP_FROM || '').trim();
  const pollMs = Number(env.HEALTH_REMINDER_POLL_MS) || 60 * 60 * 1000;
  return {
    requested: truthy(env.HEALTH_EMAIL_ENABLED),
    enabled: truthy(env.HEALTH_EMAIL_ENABLED) && Boolean(host) && Boolean(from),
    host,
    port,
    secure: env.SMTP_SECURE != null && String(env.SMTP_SECURE).trim() !== '' ? truthy(env.SMTP_SECURE) : port === 465,
    user: String(env.SMTP_USER || '').trim(),
    pass: String(env.SMTP_PASS || ''),
    from,
    replyTo: String(env.HEALTH_EMAIL_REPLY_TO || '').trim() || null,
    cc: String(env.HEALTH_EMAIL_CC || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Public base URL of the PMO app, used for "Open school report" links, e.g. https://admin.example.com/pmo/ */
    appUrl: String(env.PMO_PUBLIC_URL || '').trim().replace(/\/?$/, '/'),
    pollMs: Math.max(60 * 1000, pollMs),
  };
}

module.exports = { mailConfig, truthy };
