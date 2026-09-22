const assert = require('assert');
const { mailConfig } = require('../src/config/mail');
const { __setMailerTransport } = require('../src/services/mailer');
const n = require('../src/services/healthNotifier');
const { buildFollowup } = require('../src/services/healthService');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const DAY = 86400000;

/** Minimal stand-in for a Mongo collection: supports the update operators the notifier uses. */
function fakeCollection(docs) {
  return {
    docs,
    async updateOne({ _id }, upd) {
      const d = docs.find((x) => x._id === _id);
      for (const [k, v] of Object.entries(upd.$set || {})) {
        const parts = k.split('.');
        let o = d;
        for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
        o[parts.at(-1)] = v;
      }
      for (const [k, v] of Object.entries(upd.$inc || {})) {
        const [a, b] = k.split('.');
        d[a][b] = (d[a][b] || 0) + v;
      }
      for (const [k, v] of Object.entries(upd.$push || {})) {
        const [a, b] = k.split('.');
        d[a][b] = [...(d[a][b] || []), ...v.$each].slice(v.$slice);
      }
    },
    find(q) {
      const rows = docs.filter((d) => d.type === q.type && d.status === q.status);
      return { sort: () => ({ limit: () => ({ toArray: async () => rows }) }) };
    },
  };
}

const ON = mailConfig({ HEALTH_EMAIL_ENABLED: '1', SMTP_HOST: 'smtp.test', HEALTH_EMAIL_FROM: 'health@wizklub.test', PMO_PUBLIC_URL: 'https://admin.test/pmo' });
const OFF = mailConfig({});
const actor = { username: 'pmo.local', role: 'pmo' };

test('config is off by default and needs host + from', () => {
  assert.strictEqual(OFF.enabled, false);
  assert.strictEqual(mailConfig({ HEALTH_EMAIL_ENABLED: '1', SMTP_HOST: 'x' }).enabled, false);
  assert.strictEqual(ON.enabled, true);
  assert.strictEqual(ON.appUrl, 'https://admin.test/pmo/');
  assert.strictEqual(mailConfig({ SMTP_PORT: '465' }).secure, true);
});

test('isEmail accepts real addresses only', () => {
  assert(n.isEmail('teacher.demo@example.org'));
  assert(!n.isEmail('teacher01'));
  assert(!n.isEmail('a@b'));
  assert(!n.isEmail('x <y@z.com>'));
});

test('buildFollowup rejects an invalid teacher email and prefers email as recipient', () => {
  assert.match(buildFollowup('4100', { type: 'delegation', trigger: 'Other', note: 'n', assignee: { username: 't1', email: 'nope' } }, actor).error, /email/);
  const { doc } = buildFollowup('4100', { type: 'delegation', trigger: 'Other', note: 'n', assignee: { username: 't1', name: 'T One', email: 'T1@School.in' } }, actor);
  assert.strictEqual(doc.notify.to, 't1@school.in');
  const { doc: remark } = buildFollowup('4100', { type: 'remark', trigger: 'Other', note: 'n' }, actor);
  assert.strictEqual(remark.notify, null);
});

test('compose: delegation, new action, reminder, overdue', () => {
  const base = { school_id: '4100', trigger: 'Low student activity', note: 'Call the class teacher', assignee: { name: 'Priya' }, created_by: { username: 'pmo.local' } };
  const d = n.composeFollowupEmail({ followup: { ...base, type: 'delegation' }, schoolName: 'SC Madhapur', kind: 'new', appUrl: ON.appUrl });
  assert.match(d.subject, /^\[WizKlub\] Follow-up for you: SC Madhapur — Low student activity$/);
  assert.match(d.html, /#\/pmo\/health\/school\/4100/);
  assert.match(d.text, /Hi Priya,/);
  const due = new Date('2026-09-25T12:30:00Z');
  const now = new Date('2026-09-22T00:00:00Z').getTime();
  assert.match(n.composeFollowupEmail({ followup: { ...base, type: 'action', due_at: due }, kind: 'new', now }).subject, /Action item: School 4100 .*due 25 Sept 2026/);
  assert.match(n.composeFollowupEmail({ followup: { ...base, type: 'action', due_at: due }, kind: 'reminder', now }).subject, /^\[WizKlub\] Reminder:/);
  assert.match(n.composeFollowupEmail({ followup: { ...base, type: 'action', due_at: due }, kind: 'reminder', now: now + 10 * DAY }).subject, /Overdue action/);
});

test('compose escapes HTML from user input', () => {
  const m = n.composeFollowupEmail({ followup: { school_id: '1', type: 'delegation', trigger: 'Other', note: '<script>x</script>', assignee: { name: 'A&B' } }, kind: 'new' });
  assert(!m.html.includes('<script>'));
  assert(m.html.includes('A&amp;B'));
});

test('deliver: records not_configured / no_email without sending', async () => {
  let sent = 0;
  __setMailerTransport({ sendMail: async () => { sent += 1; return {}; } });
  const docs = [
    { _id: 1, type: 'delegation', status: 'open', school_id: '1', trigger: 'Other', note: 'x', notify: { to: 'a@b.co' } },
    { _id: 2, type: 'delegation', status: 'open', school_id: '1', trigger: 'Other', note: 'x', notify: { to: 'teacher01' } },
  ];
  const col = fakeCollection(docs);
  assert.strictEqual((await n.deliverFollowupNotice(col, docs[0], { cfg: OFF })).status, 'not_configured');
  assert.strictEqual((await n.deliverFollowupNotice(col, docs[1], { cfg: ON })).status, 'no_email');
  assert.strictEqual(sent, 0);
  assert.strictEqual(docs[0].notify.attempts, 1);
  assert.strictEqual(docs[0].notify.history[0].status, 'not_configured');
});

test('deliver: sends through SMTP and records failures', async () => {
  const outbox = [];
  __setMailerTransport({ sendMail: async (m) => { outbox.push(m); return { messageId: '<m1@test>' }; } });
  const doc = { _id: 3, type: 'delegation', status: 'open', school_id: '4100', trigger: 'Other', note: 'x', notify: { to: 't@school.in' } };
  const col = fakeCollection([doc]);
  const r = await n.deliverFollowupNotice(col, doc, { cfg: ON, schoolName: 'SC Madhapur' });
  assert.strictEqual(r.status, 'sent');
  assert.strictEqual(outbox[0].to, 't@school.in');
  assert.strictEqual(outbox[0].from, 'health@wizklub.test');
  assert.strictEqual(doc.notify.message_id, '<m1@test>');
  __setMailerTransport({ sendMail: async () => { throw new Error('535 auth failed'); } });
  const f = await n.deliverFollowupNotice(col, doc, { cfg: ON });
  assert.strictEqual(f.status, 'failed');
  assert.match(doc.notify.last_error, /535/);
  assert.strictEqual(doc.notify.attempts, 2);
});

test('reminders: due after RENAG_DAYS from the last nudge, only while open', () => {
  const created = new Date('2026-09-20T00:00:00Z');
  const f = { type: 'action', status: 'open', created_at: created, notify: { to: 'o@s.in', sent_at: created } };
  assert.strictEqual(n.isReminderDue(f, 3, created.getTime() + 2 * DAY), false);
  assert.strictEqual(n.isReminderDue(f, 3, created.getTime() + 3 * DAY), true);
  assert.strictEqual(n.isReminderDue({ ...f, last_nudged_at: new Date(created.getTime() + 3 * DAY) }, 3, created.getTime() + 4 * DAY), false);
  assert.strictEqual(n.isReminderDue({ ...f, status: 'done' }, 3, created.getTime() + 9 * DAY), false);
  assert.strictEqual(n.isReminderDue({ ...f, notify: { to: 'teacher01' } }, 3, created.getTime() + 9 * DAY), false);
});

test('sweep sends due reminders and moves last_nudged_at', async () => {
  const outbox = [];
  __setMailerTransport({ sendMail: async (m) => { outbox.push(m); return { messageId: 'r' }; } });
  const t0 = new Date('2026-09-20T00:00:00Z');
  const docs = [
    { _id: 10, type: 'action', status: 'open', school_id: '4100', trigger: 'Other', note: 'x', created_at: t0, due_at: new Date(t0.getTime() + 2 * DAY), notify: { to: 'o@s.in', sent_at: t0 } },
    { _id: 11, type: 'action', status: 'open', school_id: '4100', trigger: 'Other', note: 'x', created_at: t0, notify: { to: 'o@s.in', sent_at: new Date(t0.getTime() + 2 * DAY) } },
  ];
  const col = fakeCollection(docs);
  const now = t0.getTime() + 3 * DAY + 1000;
  const sentCount = await n.runReminderSweep({ col, renagDays: 3, resolveSchoolName: async () => 'SC Madhapur', now, cfg: ON });
  assert.strictEqual(sentCount, 1);
  assert.match(outbox[0].subject, /Overdue action: SC Madhapur/);
  assert.strictEqual(docs[0].last_nudged_at.getTime(), now);
  assert.strictEqual(await n.runReminderSweep({ col, renagDays: 3, now, cfg: OFF }), 0);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok — ${name}`);
    } catch (err) {
      console.error(`fail — ${name}`);
      console.error(err);
      process.exit(1);
    }
  }
  __setMailerTransport(null);
})();
