const assert = require('assert');
const {
  scheduledEndInstantIST,
  lsqWebhookDueAt,
  isLsqWebhookDue,
  IST_OFFSET,
} = require('../src/domain/lsqWebhookSchedule');

function test(name, fn) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`fail — ${name}`);
    throw err;
  }
}

test('scheduled end parses as IST wall clock', () => {
  const end = scheduledEndInstantIST({
    scheduled_date: '2026-06-25',
    scheduled_end_time: '17:00',
  });
  assert(end);
  assert.strictEqual(end.toISOString(), '2026-06-25T11:30:00.000Z');
});

test('due time is 8 hours after scheduled end', () => {
  const due = lsqWebhookDueAt(
    { scheduled_date: '2026-06-25', scheduled_end_time: '17:00' },
    8
  );
  assert(due);
  assert.strictEqual(due.toISOString(), '2026-06-25T19:30:00.000Z');
});

test('isLsqWebhookDue respects now boundary', () => {
  const session = { scheduled_date: '2026-06-25', scheduled_end_time: '17:00' };
  const dueMs = lsqWebhookDueAt(session, 8).getTime();
  assert.strictEqual(isLsqWebhookDue(session, dueMs - 1, 8), false);
  assert.strictEqual(isLsqWebhookDue(session, dueMs, 8), true);
});

test('missing schedule returns not due', () => {
  assert.strictEqual(isLsqWebhookDue({ scheduled_date: '', scheduled_end_time: '17:00' }), false);
  assert.strictEqual(isLsqWebhookDue({ scheduled_date: '2026-06-25', scheduled_end_time: '' }), false);
});

console.log(`IST offset constant: ${IST_OFFSET}`);
