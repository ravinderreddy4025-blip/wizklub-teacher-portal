const assert = require('assert');
const { MONTH_RE } = require('../src/models/targetModel');
const { buildFulfillmentPayload } = require('../src/controllers/targetController');
const { publicLsqHealth } = require('../src/controllers/systemController');

function test(name, fn) {
  fn();
  console.log(`ok — ${name}`);
}

test('MONTH_RE accepts YYYY-MM only', () => {
  assert.strictEqual(MONTH_RE.test('2026-08'), true);
  assert.strictEqual(MONTH_RE.test('2026-8'), false);
  assert.strictEqual(MONTH_RE.test('08-2026'), false);
  assert.strictEqual(MONTH_RE.test({ $gt: '' }), false);
});

test('fulfillment counts completed vs planned for the month', () => {
  const sessions = [
    {
      scheduled_date: '2026-08-01',
      region: 'HYD',
      branch: 'A',
      status: 'Completed',
    },
    {
      scheduled_date: '2026-08-02',
      region: 'HYD',
      branch: 'A',
      status: 'Planned',
    },
    {
      scheduled_date: '2026-07-01',
      region: 'HYD',
      branch: 'A',
      status: 'Completed',
    },
  ];
  const targets = [{ region: 'HYD', branch: 'A', target_completed: 1 }];
  const out = buildFulfillmentPayload('2026-08', sessions, targets);
  assert.strictEqual(out.month, '2026-08');
  assert.strictEqual(out.schools.length, 1);
  assert.strictEqual(out.schools[0].actual_completed, 1);
  assert.strictEqual(out.schools[0].actual_scheduled, 1);
  assert.strictEqual(out.summary.schools_met, 1);
});

test('public health strips lastRunError and internals', () => {
  const pub = publicLsqHealth({
    enabled: true,
    configured: true,
    mode: 'runtime_student_ids',
    running: false,
    pendingDue: 2,
    lastRunError: 'http_500 crm token leaked',
    lastRunAt: '2026-08-17T00:00:00.000Z',
    pollIntervalMs: 60000,
  });
  assert.strictEqual(pub.enabled, true);
  assert.strictEqual(pub.pendingDue, 2);
  assert.strictEqual(pub.lastRunError, undefined);
  assert.strictEqual(pub.pollIntervalMs, undefined);
});

console.log('targetFulfillment.test.js: ok');
