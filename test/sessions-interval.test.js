const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePmoSessionsBody,
  pmoSessionsTimeOverlap,
  pmoConflictingGrades,
} = require('../backend/src/domain/sessions');

const base = (id, start, end, grade = 'G1') => ({
  id,
  scheduled_date: '2030-06-15',
  scheduled_start_time: start,
  scheduled_end_time: end,
  grade,
  region: 'West Bengal',
  branch: 'Test Branch',
  venue: 'Online',
  teacher: 'T',
  location: 'https://example.com/z',
  invited: 10,
  status: 'Planned',
});

test('validatePmoSessionsBody rejects overlapping ranges same grade', () => {
  const body = [base('a', '10:00', '11:00'), base('b', '10:30', '11:30')];
  const r = validatePmoSessionsBody(body);
  assert.equal(r.ok, false);
  assert.match(r.msg, /already has a session at this time/i);
});

test('validatePmoSessionsBody allows adjacent ranges (half-open)', () => {
  const body = [base('a', '10:00', '11:00'), base('b', '11:00', '12:00')];
  const r = validatePmoSessionsBody(body);
  assert.equal(r.ok, true);
});

test('validatePmoSessionsBody allows same times when no grade is shared', () => {
  const body = [base('a', '10:00', '11:00', 'G1'), base('b', '10:00', '11:00', 'G2')];
  const r = validatePmoSessionsBody(body);
  assert.equal(r.ok, true);
});

test('validatePmoSessionsBody rejects when subset shares a grade (G1,G2,G3 vs G1)', () => {
  const body = [base('a', '10:00', '11:00', 'G1, G2, G3'), base('b', '10:00', '11:00', 'G1')];
  const r = validatePmoSessionsBody(body);
  assert.equal(r.ok, false);
  assert.match(r.msg, /G1/i);
  assert.match(r.msg, /already has|already have/i);
});

test('pmoSessionsTimeOverlap when same grade', () => {
  const x = base('a', '09:00', '10:00');
  const y = base('b', '09:30', '10:30');
  assert.equal(pmoSessionsTimeOverlap(x, y), true);
  assert.equal(pmoSessionsTimeOverlap(y, x), true);
});

test('pmoSessionsTimeOverlap false when times overlap but grades disjoint', () => {
  const x = base('a', '09:00', '10:00', 'G1');
  const y = base('b', '09:30', '10:30', 'G2');
  assert.equal(pmoSessionsTimeOverlap(x, y), false);
});

test('pmoConflictingGrades returns shared labels', () => {
  const x = base('a', '10:00', '11:00', 'G1, G2, G3');
  const y = base('b', '10:00', '11:00', 'G1');
  assert.deepEqual(pmoConflictingGrades(x, y), ['G1']);
});
