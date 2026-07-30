const { isProd } = require('./env');
const { parseDelayHours } = require('../domain/lsqWebhookSchedule');

const DEV_FALLBACK_WEBHOOK_URL =
  'https://app.srichaitanyacrm.com/apigateway/wizklub_parents_session_webhook/?token=0fe1304bde5e615bbf297d653e43bd2afba04ad3';

function envFlag(name, defaultFalse = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultFalse;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function envInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function getWebhookUrl() {
  const configured = String(process.env.WIZKLUB_PARENTS_SESSION_WEBHOOK_URL || '').trim();
  if (configured) return configured;
  if (isProd) return '';
  return DEV_FALLBACK_WEBHOOK_URL;
}

const lsqWebhookConfig = {
  enabled: !envFlag('LSQ_WEBHOOK_DISABLED'),
  url: getWebhookUrl(),
  delayHours: parseDelayHours(),
  pollIntervalMs: envInt('LSQ_WEBHOOK_POLL_INTERVAL_MS', 60_000, { min: 30_000, max: 3_600_000 }),
  fetchTimeoutMs: envInt('LSQ_WEBHOOK_FETCH_TIMEOUT_MS', 15_000, { min: 3_000, max: 120_000 }),
  maxAttempts: envInt('LSQ_WEBHOOK_MAX_ATTEMPTS', 10, { min: 1, max: 50 }),
  batchSize: envInt('LSQ_WEBHOOK_BATCH_SIZE', 25, { min: 1, max: 200 }),
  claimTtlMs: envInt('LSQ_WEBHOOK_CLAIM_TTL_MS', 5 * 60_000, { min: 30_000, max: 3_600_000 }),
};

function assertLsqWebhookProductionConfig() {
  if (!isProd) return;
  if (!lsqWebhookConfig.enabled) {
    console.warn('[WARN] Production: LSQ_WEBHOOK_DISABLED=1 — sessions with student_ids will not sync to LSQ.');
    return;
  }
  if (!lsqWebhookConfig.url) {
    console.error(
      '[FATAL] Production requires WIZKLUB_PARENTS_SESSION_WEBHOOK_URL when LSQ webhooks are enabled.'
    );
    process.exit(1);
  }
}

module.exports = {
  lsqWebhookConfig,
  assertLsqWebhookProductionConfig,
};
