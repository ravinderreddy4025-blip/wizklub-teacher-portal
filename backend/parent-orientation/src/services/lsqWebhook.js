const { lsqWebhookConfig } = require('../config/lsqWebhook');
const { webhookPayload, payloadFingerprint } = require('../domain/lsqSync');
const { mongo, mongoPingOk, sessionsCollection, sessionDocToClient } = require('./mongo');

let timer = null;
let running = false;
let lastRunAt = null;
let lastRunError = null;
let lastRunSent = 0;
let lastRunFailed = 0;

/** Overridable for unit/integration tests (production keeps defaults). */
const testHooks = {
  getCollection: null,
  fetchFn: null,
};

function coll() {
  return (testHooks.getCollection || sessionsCollection)();
}

function httpFetch(...args) {
  return (testHooks.fetchFn || fetch)(...args);
}

function __setLsqWebhookTestHooks(partial = {}) {
  if (partial.getCollection !== undefined) testHooks.getCollection = partial.getCollection;
  if (partial.fetchFn !== undefined) testHooks.fetchFn = partial.fetchFn;
}

function __resetLsqWebhookTestHooks() {
  testHooks.getCollection = null;
  testHooks.fetchFn = null;
  running = false;
}

async function postWebhook(row) {
  const payload = webhookPayload(row);
  if (!payload.id) return { ok: false, reason: 'missing_id' };
  if (!payload.scheduled_date) return { ok: false, reason: 'missing_scheduled_date' };
  if (!payload.student_ids.length) return { ok: false, reason: 'missing_student_ids' };
  if (!lsqWebhookConfig.url) return { ok: false, reason: 'webhook_url_not_configured' };

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), lsqWebhookConfig.fetchTimeoutMs);
  try {
    const r = await httpFetch(lsqWebhookConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, reason: `http_${r.status}`, detail: body.slice(0, 300) };
    }
    return { ok: true, fingerprint: payloadFingerprint(payload) };
  } catch (err) {
    const reason =
      err && err.name === 'AbortError' ? 'timeout' : err && err.message ? err.message : 'fetch_failed';
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

function pendingDueFilter(now = new Date()) {
  const claimExpiry = new Date(now.getTime() - lsqWebhookConfig.claimTtlMs);
  return {
    'student_ids.0': { $exists: true },
    lsq_webhook_due_at: { $lte: now },
    $and: [
      { $or: [{ lsq_webhook_sent_at: { $exists: false } }, { lsq_webhook_sent_at: null }] },
      { $or: [{ lsq_webhook_failed_at: { $exists: false } }, { lsq_webhook_failed_at: null }] },
      {
        $or: [
          { lsq_webhook_claimed_at: { $exists: false } },
          { lsq_webhook_claimed_at: null },
          { lsq_webhook_claimed_at: { $lt: claimExpiry } },
        ],
      },
      {
        $or: [
          { lsq_webhook_attempts: { $exists: false } },
          { lsq_webhook_attempts: { $lt: lsqWebhookConfig.maxAttempts } },
        ],
      },
    ],
  };
}

async function claimSessionForWebhook(sessionId, now = new Date()) {
  const claimExpiry = new Date(now.getTime() - lsqWebhookConfig.claimTtlMs);
  return coll().findOneAndUpdate(
    {
      _id: sessionId,
      'student_ids.0': { $exists: true },
      lsq_webhook_due_at: { $lte: now },
      $and: [
        { $or: [{ lsq_webhook_sent_at: { $exists: false } }, { lsq_webhook_sent_at: null }] },
        { $or: [{ lsq_webhook_failed_at: { $exists: false } }, { lsq_webhook_failed_at: null }] },
        {
          $or: [
            { lsq_webhook_claimed_at: { $exists: false } },
            { lsq_webhook_claimed_at: null },
            { lsq_webhook_claimed_at: { $lt: claimExpiry } },
          ],
        },
        {
          $or: [
            { lsq_webhook_attempts: { $exists: false } },
            { lsq_webhook_attempts: { $lt: lsqWebhookConfig.maxAttempts } },
          ],
        },
      ],
    },
    {
      $set: { lsq_webhook_claimed_at: now, lsq_webhook_last_attempt_at: now },
      $inc: { lsq_webhook_attempts: 1 },
      $unset: { lsq_webhook_last_error: '' },
    },
    { returnDocument: 'after' }
  );
}

async function markLsqWebhookSent(sessionId, fingerprint, now = new Date()) {
  await coll().updateOne(
    { _id: sessionId },
    {
      $set: {
        lsq_webhook_sent_at: now,
        lsq_webhook_payload_fp: fingerprint,
      },
      $unset: {
        lsq_webhook_claimed_at: '',
        lsq_webhook_last_error: '',
        lsq_webhook_failed_at: '',
        lsq_webhook_due_at: '',
        lsq_webhook_attempts: '',
        lsq_webhook_last_attempt_at: '',
      },
    }
  );
}

async function markLsqWebhookFailedAttempt(sessionId, reason, attempts, now = new Date()) {
  const update = {
    $set: {
      lsq_webhook_last_error: String(reason || 'unknown').slice(0, 500),
      lsq_webhook_last_attempt_at: now,
    },
    $unset: { lsq_webhook_claimed_at: '' },
  };
  if (attempts >= lsqWebhookConfig.maxAttempts) {
    update.$set.lsq_webhook_failed_at = now;
    console.error(
      `[LSQ webhook] Abandoning session ${sessionId} after ${attempts} failed attempts (last: ${reason}).`
    );
  }
  await coll().updateOne({ _id: sessionId }, update);
}

async function findDueSessionIds(limit = lsqWebhookConfig.batchSize) {
  const docs = await coll()
    .find(pendingDueFilter())
    .sort({ lsq_webhook_due_at: 1 })
    .limit(limit)
    .project({ _id: 1 })
    .toArray();
  return docs.map((d) => d._id);
}

async function processDueLsqWebhooks() {
  if (running) return { skipped: true, reason: 'already_running' };
  if (!lsqWebhookConfig.enabled) return { skipped: true, reason: 'disabled' };
  if (!lsqWebhookConfig.url) return { skipped: true, reason: 'no_webhook_url' };
  const usingTestColl = Boolean(testHooks.getCollection);
  if (!usingTestColl) {
    if (!mongo.client) return { skipped: true, reason: 'no_mongo' };
    if (!mongo.ready) {
      mongo.ready = await mongoPingOk();
      if (!mongo.ready) return { skipped: true, reason: 'mongo_unavailable' };
    }
  }

  running = true;
  lastRunAt = new Date();
  lastRunSent = 0;
  lastRunFailed = 0;
  lastRunError = null;

  try {
    const ids = await findDueSessionIds();
    if (!ids.length) return { processed: 0, sent: 0, failed: 0 };

    for (const sessionId of ids) {
      const claimed = await claimSessionForWebhook(sessionId);
      if (!claimed) continue;

      const client = sessionDocToClient(claimed);
      if (!client) {
        await markLsqWebhookFailedAttempt(sessionId, 'invalid_session_record', 1);
        lastRunFailed += 1;
        continue;
      }

      const result = await postWebhook(client);
      const attempts = Number(claimed.lsq_webhook_attempts) || 1;

      if (result.ok) {
        await markLsqWebhookSent(sessionId, result.fingerprint);
        lastRunSent += 1;
        console.log(`[LSQ webhook] Sent session ${client.id} (runtime, student_ids present).`);
      } else {
        const reason = result.detail ? `${result.reason}: ${result.detail}` : result.reason;
        await markLsqWebhookFailedAttempt(sessionId, reason, attempts);
        lastRunFailed += 1;
        console.error(`[LSQ webhook] Attempt ${attempts} failed for session ${client.id}: ${reason}`);
      }
    }

    return { processed: ids.length, sent: lastRunSent, failed: lastRunFailed };
  } catch (err) {
    lastRunError = err && err.message ? err.message : String(err);
    console.error('[LSQ webhook] Scheduler error:', lastRunError);
    return { error: lastRunError };
  } finally {
    running = false;
  }
}

function kickLsqWebhookSync() {
  void processDueLsqWebhooks();
}

async function countPendingDueWebhooks() {
  if (!testHooks.getCollection && (!mongo.client || !mongo.ready)) return null;
  try {
    return await coll().countDocuments(pendingDueFilter());
  } catch {
    return null;
  }
}

function getLsqWebhookSchedulerStatus() {
  return {
    enabled: lsqWebhookConfig.enabled,
    configured: Boolean(lsqWebhookConfig.url),
    mode: 'runtime_student_ids',
    delayHours: lsqWebhookConfig.delayHours,
    pollIntervalMs: lsqWebhookConfig.pollIntervalMs,
    maxAttempts: lsqWebhookConfig.maxAttempts,
    running,
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    lastRunSent,
    lastRunFailed,
    lastRunError,
  };
}

async function getLsqWebhookHealth() {
  const status = getLsqWebhookSchedulerStatus();
  if (!status.enabled || !status.configured || !mongo.client) {
    return { ...status, pendingDue: null };
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
  }
  const pendingDue = mongo.ready ? await countPendingDueWebhooks() : null;
  return { ...status, pendingDue };
}

function startLsqWebhookScheduler() {
  if (timer) return;
  if (!lsqWebhookConfig.enabled) {
    console.log('[LSQ webhook] Scheduler disabled (LSQ_WEBHOOK_DISABLED=1).');
    return;
  }
  if (!lsqWebhookConfig.url) {
    console.warn('[LSQ webhook] Scheduler not started — WIZKLUB_PARENTS_SESSION_WEBHOOK_URL is not set.');
    return;
  }

  console.log(
    `[LSQ webhook] Scheduler started — runtime sync when student_ids present, ` +
      `poll ${lsqWebhookConfig.pollIntervalMs / 1000}s, batch ${lsqWebhookConfig.batchSize}, ` +
      `max attempts ${lsqWebhookConfig.maxAttempts}.`
  );
  kickLsqWebhookSync();
  timer = setInterval(kickLsqWebhookSync, lsqWebhookConfig.pollIntervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopLsqWebhookScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  webhookPayload,
  speakerCompletedWebhookPayload: webhookPayload,
  postWebhook,
  postSpeakerCompletedWebhook: postWebhook,
  processDueLsqWebhooks,
  kickLsqWebhookSync,
  getLsqWebhookSchedulerStatus,
  getLsqWebhookHealth,
  startLsqWebhookScheduler,
  stopLsqWebhookScheduler,
  __setLsqWebhookTestHooks,
  __resetLsqWebhookTestHooks,
};
