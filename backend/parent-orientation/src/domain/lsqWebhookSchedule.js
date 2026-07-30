const { migrateLegacyToCanonical } = require('./sessionKeys');

const IST_OFFSET = '+05:30';
const DEFAULT_DELAY_HOURS = 8;

function parseDelayHours() {
  const raw = process.env.LSQ_WEBHOOK_DELAY_HOURS;
  if (raw == null || raw === '') return DEFAULT_DELAY_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DELAY_HOURS;
  return n;
}

/** Wall-clock session end in IST (scheduled_date + scheduled_end_time). */
function scheduledEndInstantIST(session) {
  const row = migrateLegacyToCanonical({ ...session });
  const date = String(row.scheduled_date || '').trim();
  const time = String(row.scheduled_end_time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return null;
  const norm = /^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time;
  if (!/^\d{1,2}:\d{2}:\d{2}$/.test(norm)) return null;
  const inst = new Date(`${date}T${norm}${IST_OFFSET}`);
  return Number.isNaN(inst.getTime()) ? null : inst;
}

/** When the LSQ webhook should fire: scheduled end (IST) + delay hours. */
function lsqWebhookDueAt(session, delayHours = parseDelayHours()) {
  const end = scheduledEndInstantIST(session);
  if (!end) return null;
  return new Date(end.getTime() + delayHours * 60 * 60 * 1000);
}

function isLsqWebhookDue(session, nowMs = Date.now(), delayHours = parseDelayHours()) {
  const due = lsqWebhookDueAt(session, delayHours);
  if (!due) return false;
  return nowMs >= due.getTime();
}

module.exports = {
  IST_OFFSET,
  DEFAULT_DELAY_HOURS,
  parseDelayHours,
  scheduledEndInstantIST,
  lsqWebhookDueAt,
  isLsqWebhookDue,
};
