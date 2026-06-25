const { lsqWebhookConfig } = require('../config/lsqWebhook');
const { parseDelayHours } = require('../domain/lsqWebhookSchedule');
const { mongo, mongoPingOk, sessionsCollection, sessionDocToClient } = require('./mongo');

let timer = null;
let running = false;
let lastRunAt = null;
let lastRunError = null;
let lastRunSent = 0;
let lastRunFailed = 0;

function speakerCompletedWebhookPayload(row) {
  return {
    id: String(row.id || '').trim(),
    scheduled_date: String(row.scheduled_date || '').trim(),
    venue: String(row.venue || '').trim(),
    teacher: String(row.teacher || '').trim(),
    student_ids: Array.isArray(row.student_ids)
      ? row.student_ids.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
  };
}

async function postSpeakerCompletedWebhook(row) {
  const payload = speakerCompletedWebhookPayload(row);
  if (!payload.id) return { ok: false, reason: 'missing_id' };
  if (!payload.scheduled_date) return { ok: false, reason: 'missing_scheduled_date' };
  if (!lsqWebhookConfig.url) return { ok: false, reason: 'webhook_url_not_configured' };

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), lsqWebhookConfig.fetchTimeoutMs);
  try {
    const r = await fetch(lsqWebhookConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, reason: `http_${r.status}`, detail: body.slice(0, 300) };
    }
    return { ok: true };
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
    status: 'Completed',
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
  const result = await sessionsCollection().findOneAndUpdate(
    {
      _id: sessionId,
      status: 'Completed',
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
  return result;
}

async function markLsqWebhookSent(sessionId, now = new Date()) {
  await sessionsCollection().updateOne(
    { _id: sessionId },
    {
      $set: { lsq_webhook_sent_at: now },
      $unset: { lsq_webhook_claimed_at: '', lsq_webhook_last_error: '', lsq_webhook_failed_at: '' },
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
  await sessionsCollection().updateOne({ _id: sessionId }, update);
}

async function findDueCompletedSessionIds(limit = lsqWebhookConfig.batchSize) {
  const docs = await sessionsCollection()
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
  if (!mongo.client) return { skipped: true, reason: 'no_mongo' };
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) return { skipped: true, reason: 'mongo_unavailable' };
  }

  running = true;
  lastRunAt = new Date();
  lastRunSent = 0;
  lastRunFailed = 0;
  lastRunError = null;

  try {
    const ids = await findDueCompletedSessionIds();
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

      const result = await postSpeakerCompletedWebhook(client);
      const attempts = Number(claimed.lsq_webhook_attempts) || 1;

      if (result.ok) {
        await markLsqWebhookSent(sessionId);
        lastRunSent += 1;
        console.log(
          `[LSQ webhook] Sent session ${client.id} (${parseDelayHours()}h after scheduled end IST).`
        );
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

async function countPendingDueWebhooks() {
  if (!mongo.client || !mongo.ready) return null;
  try {
    return await sessionsCollection().countDocuments(pendingDueFilter());
  } catch {
    return null;
  }
}

function getLsqWebhookSchedulerStatus() {
  return {
    enabled: lsqWebhookConfig.enabled,
    configured: Boolean(lsqWebhookConfig.url),
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
    `[LSQ webhook] Scheduler started — ${lsqWebhookConfig.delayHours}h after scheduled end (IST), ` +
      `poll ${lsqWebhookConfig.pollIntervalMs / 1000}s, batch ${lsqWebhookConfig.batchSize}, ` +
      `max attempts ${lsqWebhookConfig.maxAttempts}.`
  );
  void processDueLsqWebhooks();
  timer = setInterval(() => {
    void processDueLsqWebhooks();
  }, lsqWebhookConfig.pollIntervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopLsqWebhookScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  speakerCompletedWebhookPayload,
  postSpeakerCompletedWebhook,
  processDueLsqWebhooks,
  getLsqWebhookSchedulerStatus,
  getLsqWebhookHealth,
  startLsqWebhookScheduler,
  stopLsqWebhookScheduler,
};
