const assert = require('assert');
const {
  validateSessionId,
  validatePmoSessionRecord,
  validatePmoSessionsBody,
  isSafeHttpUrl,
  pmoSessionsTimeOverlap,
} = require('../src/domain/sessions');
const { escapeHtml } = require('../src/controllers/joinController');

function test(name, fn) {
  fn();
  console.log(`ok — ${name}`);
}

const valid = {
  id: '11111111-1111-4111-8111-111111111111',
  scheduled_date: '2026-08-17',
  scheduled_start_time: '10:00',
  scheduled_end_time: '11:00',
  grade: 'G1',
  region: 'Hyderabad',
  branch: 'Branch A',
  venue: 'Online',
  teacher: 'Teacher A',
  location: 'https://zoom.us/j/123',
  invited: 20,
  status: 'Planned',
};

test('session id accepts uuid and legacy ids, rejects junk', () => {
  assert.strictEqual(validateSessionId(valid.id), true);
  assert.strictEqual(validateSessionId('sess-1'), true);
  assert.strictEqual(validateSessionId('../etc/passwd'), false);
  assert.strictEqual(validateSessionId('a'.repeat(81)), false);
  assert.strictEqual(validateSessionId(''), false);
});

test('rejects unsafe meeting URLs', () => {
  assert.strictEqual(isSafeHttpUrl('https://zoom.us/j/1'), true);
  assert.strictEqual(isSafeHttpUrl('http://meet.example.com/x'), true);
  assert.strictEqual(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.strictEqual(isSafeHttpUrl('data:text/html,hi'), false);
  assert.strictEqual(isSafeHttpUrl('https://user:pass@evil.com'), false);
  assert.strictEqual(isSafeHttpUrl('not-a-url'), false);
  assert.strictEqual(isSafeHttpUrl(''), false);
});

test('online session requires a safe http(s) link', () => {
  assert.strictEqual(validatePmoSessionRecord(valid), null);
  assert.match(
    validatePmoSessionRecord({ ...valid, location: 'javascript:alert(1)' }),
    /meeting link/
  );
  assert.match(validatePmoSessionRecord({ ...valid, invited: -1 }), /invited/);
  assert.match(validatePmoSessionRecord({ ...valid, status: 'Nope' }), /status/);
});

test('bulk payload rejects non-array, duplicates, and overlap', () => {
  const bad = validatePmoSessionsBody({ id: valid.id });
  assert.strictEqual(bad.ok, false);
  const dup = validatePmoSessionsBody([valid, { ...valid }]);
  assert.strictEqual(dup.ok, false);
  const other = {
    ...valid,
    id: '22222222-2222-4222-8222-222222222222',
    scheduled_start_time: '10:30',
    scheduled_end_time: '11:30',
  };
  const overlap = validatePmoSessionsBody([valid, other]);
  assert.strictEqual(overlap.ok, false);
});

test('time overlap helper', () => {
  const b = { ...valid, id: 'other', scheduled_start_time: '10:30', scheduled_end_time: '11:30' };
  assert.strictEqual(pmoSessionsTimeOverlap(valid, b), true);
  assert.strictEqual(
    pmoSessionsTimeOverlap(valid, { ...b, scheduled_start_time: '11:00', scheduled_end_time: '12:00' }),
    false
  );
});

test('escapeHtml encodes XSS payloads', () => {
  assert.strictEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(escapeHtml('"quoted"'), '&quot;quoted&quot;');
});

console.log('sessionsValidation.test.js: ok');
