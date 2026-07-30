const assert = require('assert');
const {
  webhookPayload,
  payloadFingerprint,
  attachLsqWebhookFields,
  lsqPendingUpdate,
} = require('../src/domain/lsqSync');

function test(name, fn) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`fail — ${name}`);
    throw err;
  }
}

const base = {
  id: 'sess-1',
  status: 'Planned',
  scheduled_date: '2026-07-15',
  venue: 'Online',
  teacher: 'Teacher A',
  student_ids: ['SCSDTEST32328372837'],
};

test('webhookPayload includes status and normalized student_ids', () => {
  const p = webhookPayload({ ...base, student_ids: ['  scsdtest32328372837  '] });
  assert.strictEqual(p.status, 'Planned');
  assert.deepStrictEqual(p.student_ids, ['SCSDTEST32328372837']);
});

test('empty student_ids clears LSQ fields', () => {
  const doc = attachLsqWebhookFields(
    { ...base, student_ids: [], lsq_webhook_sent_at: new Date() },
    null
  );
  assert.strictEqual(doc.lsq_webhook_sent_at, undefined);
  assert.strictEqual(doc.lsq_webhook_due_at, undefined);
});

test('student_ids present marks pending due_at', () => {
  const doc = attachLsqWebhookFields({ ...base }, null);
  assert(doc.lsq_webhook_due_at instanceof Date);
  assert.strictEqual(doc.lsq_webhook_sent_at, undefined);
});

test('same fingerprint already sent skips re-pending', () => {
  const fp = payloadFingerprint(base);
  const sentAt = new Date('2026-01-01T00:00:00.000Z');
  const doc = attachLsqWebhookFields(
    { ...base },
    { lsq_webhook_payload_fp: fp, lsq_webhook_sent_at: sentAt }
  );
  assert.strictEqual(doc.lsq_webhook_sent_at, sentAt);
  assert.strictEqual(doc.lsq_webhook_due_at, undefined);
  assert.strictEqual(doc.lsq_webhook_payload_fp, fp);
});

test('fingerprint change forces re-pending and clears failed', () => {
  const fp = payloadFingerprint(base);
  const doc = attachLsqWebhookFields(
    { ...base, teacher: 'Teacher B' },
    {
      lsq_webhook_payload_fp: fp,
      lsq_webhook_sent_at: new Date(),
      lsq_webhook_failed_at: new Date(),
      lsq_webhook_attempts: 9,
    }
  );
  assert(doc.lsq_webhook_due_at instanceof Date);
  assert.strictEqual(doc.lsq_webhook_sent_at, undefined);
  assert.strictEqual(doc.lsq_webhook_failed_at, undefined);
  assert.strictEqual(doc.lsq_webhook_attempts, undefined);
});

test('lsqPendingUpdate returns null when already synced for same payload', () => {
  const fp = payloadFingerprint(base);
  const update = lsqPendingUpdate(base, {
    lsq_webhook_payload_fp: fp,
    lsq_webhook_sent_at: new Date(),
  });
  assert.strictEqual(update, null);
});

test('lsqPendingUpdate marks pending when student added', () => {
  const update = lsqPendingUpdate(base, null);
  assert(update.$set.lsq_webhook_due_at instanceof Date);
  assert.ok(update.$unset.lsq_webhook_sent_at === '');
});

console.log('lsqSync tests passed');
