/**
 * Email notices for School health follow-ups.
 *
 *  - Delegation   → one email to the teacher when it is created.
 *  - Action item  → one email to the owner when created, then a reminder every RENAG_DAYS while it stays open
 *                   (subject switches to "overdue" after the due date). Marking it done stops reminders.
 *  - Remark       → never emailed.
 *
 * Every attempt is written back to the follow-up (`notify.status`, `notify.attempts`, `notify.history[]`) so the
 * PMO screen shows what really happened: sent · failed · no_email · not_configured.
 */
const { mailConfig } = require('../config/mail');
const { sendMail } = require('./mailer');

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const HISTORY_MAX = 20;
const DAY = 86400000;

const isEmail = (s) => typeof s === 'string' && s.length <= 160 && EMAIL_RE.test(s.trim());

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** When the next reminder for an open action item is due (null if none). Pure. */
function reminderDueAt(f, renagDays) {
  if (!f || f.type !== 'action' || f.status !== 'open' || !f.notify) return null;
  const base = new Date(f.last_nudged_at || (f.notify && f.notify.sent_at) || f.created_at);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + renagDays * DAY);
}

function isReminderDue(f, renagDays, now = Date.now()) {
  const at = reminderDueAt(f, renagDays);
  return Boolean(at && at.getTime() <= now && isEmail(f.notify.to));
}

function reportUrl(appUrl, schoolId) {
  if (!appUrl || appUrl === '/') return '';
  return `${appUrl}#/pmo/health/school/${encodeURIComponent(String(schoolId))}`;
}

/**
 * @param {{ followup: object, schoolName?: string, kind: 'new'|'reminder', appUrl?: string, now?: number }} p
 * @returns {{ subject: string, text: string, html: string }}
 */
function composeFollowupEmail({ followup: f, schoolName, kind, appUrl = '', now = Date.now() }) {
  const school = schoolName || `School ${f.school_id}`;
  const who = (f.assignee && (f.assignee.name || f.assignee.username)) || 'there';
  const by = (f.created_by && f.created_by.username) || 'the PMO team';
  const overdue = f.due_at && new Date(f.due_at).getTime() < now;
  const due = f.due_at ? fmtDate(f.due_at) : '';
  const link = reportUrl(appUrl, f.school_id);

  let subject;
  let lead;
  if (f.type === 'delegation') {
    subject = `[WizKlub] Follow-up for you: ${school} — ${f.trigger}`;
    lead = `${by} has delegated a follow-up on ${school} to you.`;
  } else if (kind === 'reminder') {
    subject = overdue
      ? `[WizKlub] Overdue action: ${school} — ${f.trigger} (was due ${due})`
      : `[WizKlub] Reminder: ${school} — ${f.trigger} (due ${due})`;
    lead = overdue
      ? `This action item on ${school} was due on ${due} and is still open.`
      : `Friendly reminder: this action item on ${school} is still open.`;
  } else {
    subject = `[WizKlub] Action item: ${school} — ${f.trigger}${due ? ` (due ${due})` : ''}`;
    lead = `${by} has assigned you an action item on ${school}.`;
  }

  const lines = [
    `Hi ${who},`,
    '',
    lead,
    '',
    `Why: ${f.trigger}`,
    `What: ${f.note}`,
    due ? `Due: ${due}` : null,
    link ? `Open the school report: ${link}` : null,
    '',
    f.type === 'action' ? 'Reply to the PMO team once it is done so they can mark it complete.' : null,
    '— WizKlub School health',
  ].filter((l) => l !== null);

  const row = (k, v) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#4A5B68;font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#02344F;font-size:14px">${v}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#FFF7EE;font-family:Poppins,Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EE;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 12px rgba(0,0,0,.16)">
<tr><td style="background:#F47D31;padding:18px 24px;color:#02344F;font-weight:600;font-size:16px">WizKlub Futurz · School health</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;color:#02344F;font-size:16px">Hi ${esc(who)},</p>
<p style="margin:0 0 16px;color:#02344F;font-size:15px;line-height:1.5">${esc(lead)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">${row('Why', esc(f.trigger))}${row('What', esc(f.note).replace(/\n/g, '<br>'))}${due ? row(overdue ? 'Was due' : 'Due', `<strong style="color:${overdue ? '#B42323' : '#02344F'}">${esc(due)}</strong>`) : ''}</table>
${link ? `<p style="margin:24px 0 8px"><a href="${esc(link)}" style="display:inline-block;background:#FF8C2B;color:#02344F;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;box-shadow:0 3px 0 #D9661A">Open school report</a></p>` : ''}
${f.type === 'action' ? '<p style="margin:16px 0 0;color:#4A5B68;font-size:13px">Reply to the PMO team once it is done so they can mark it complete.</p>' : ''}
</td></tr></table>
<p style="color:#6C6E72;font-size:12px;margin:16px 0 0">Sent by WizKlub School health on behalf of ${esc(by)}.</p>
</td></tr></table></body></html>`;

  return { subject, text: lines.join('\n'), html };
}

/**
 * Send (or record why we could not send) one notice and persist the outcome.
 * @param {import('mongodb').Collection} col  health_followups
 * @param {object} doc  follow-up document (with _id)
 * @param {{ kind: 'new'|'reminder', schoolName?: string, now?: number, cfg?: object }} opts
 */
async function deliverFollowupNotice(col, doc, { kind = 'new', schoolName, now = Date.now(), cfg = mailConfig() } = {}) {
  if (!doc || !doc.notify) return null;
  const to = String(doc.notify.to || '').trim();
  const at = new Date(now);
  let status;
  let error = null;
  let messageId = null;

  if (!isEmail(to)) status = 'no_email';
  else if (!cfg.enabled) status = 'not_configured';
  else {
    try {
      const mail = composeFollowupEmail({ followup: doc, schoolName, kind, appUrl: cfg.appUrl, now });
      ({ messageId } = await sendMail({ to, ...mail }, cfg));
      status = 'sent';
    } catch (err) {
      status = 'failed';
      error = String((err && err.message) || err).slice(0, 300);
    }
  }

  const set = { 'notify.status': status, 'notify.last_attempt_at': at, 'notify.last_error': error, updated_at: at };
  if (status === 'sent') {
    set['notify.sent_at'] = at;
    set['notify.message_id'] = messageId;
    if (kind === 'reminder') set.last_nudged_at = at;
  }
  const entry = { at, kind, status, ...(error ? { error } : {}) };
  if (col && doc._id) {
    await col.updateOne(
      { _id: doc._id },
      { $set: set, $inc: { 'notify.attempts': 1 }, $push: { 'notify.history': { $each: [entry], $slice: -HISTORY_MAX } } }
    );
  }
  const tag = status === 'sent' ? 'sent' : status === 'failed' ? `FAILED (${error})` : status;
  console.log(`[health email] ${kind} ${doc.type} "${doc.trigger}" school=${doc.school_id} → ${to || '—'}: ${tag}`);
  return { status, error, messageId, at };
}

let timer = null;

/** One pass over open action items; sends the reminders that are due. Returns how many were attempted. */
async function runReminderSweep({ col, renagDays, resolveSchoolName, now = Date.now(), cfg = mailConfig() }) {
  if (!col || !cfg.enabled) return 0;
  const rows = await col
    .find({ type: 'action', status: 'open', 'notify.to': { $regex: '@' } })
    .sort({ created_at: 1 })
    .limit(500)
    .toArray();
  let n = 0;
  for (const f of rows) {
    if (!isReminderDue(f, renagDays, now)) continue;
    const schoolName = resolveSchoolName ? await resolveSchoolName(f.school_id).catch(() => null) : null;
    await deliverFollowupNotice(col, f, { kind: 'reminder', schoolName, now, cfg });
    n += 1;
  }
  return n;
}

function startHealthReminderScheduler({ getCollection, renagDays, resolveSchoolName }) {
  const cfg = mailConfig();
  if (timer) return;
  if (!cfg.enabled) {
    console.log(
      cfg.requested
        ? '[health email] HEALTH_EMAIL_ENABLED=1 but SMTP_HOST / HEALTH_EMAIL_FROM missing — follow-up emails are recorded, not sent.'
        : '[health email] Off (set HEALTH_EMAIL_ENABLED=1 + SMTP_* to send follow-up emails). Notices are recorded only.'
    );
    return;
  }
  console.log(`[health email] On — SMTP ${cfg.host}:${cfg.port}, reminders every ${renagDays} days, sweep every ${Math.round(cfg.pollMs / 60000)} min.`);
  const tick = () =>
    runReminderSweep({ col: getCollection(), renagDays, resolveSchoolName, cfg }).catch((err) =>
      console.error('[health email] reminder sweep failed:', err && err.message ? err.message : err)
    );
  tick();
  timer = setInterval(tick, cfg.pollMs);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopHealthReminderScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  isEmail,
  reminderDueAt,
  isReminderDue,
  composeFollowupEmail,
  deliverFollowupNotice,
  runReminderSweep,
  startHealthReminderScheduler,
  stopHealthReminderScheduler,
};
