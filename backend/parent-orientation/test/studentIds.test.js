const assert = require('assert');
const {
  normalizeStudentId,
  isValidStudentId,
  normalizeStudentIds,
  addStudentId,
} = require('../src/domain/studentIds');

function test(name, fn) {
  fn();
  console.log(`ok — ${name}`);
}

test('normalizes and uppercases', () => {
  assert.strictEqual(normalizeStudentId('  scsd-12  '), 'SCSD-12');
});

test('rejects empty, unicode, and injection-like values', () => {
  assert.strictEqual(isValidStudentId(''), false);
  assert.strictEqual(isValidStudentId(null), false);
  assert.strictEqual(isValidStudentId('id with space'), false);
  assert.strictEqual(isValidStudentId("'; db.dropDatabase();"), false);
  assert.strictEqual(isValidStudentId('<script>alert(1)</script>'), false);
  assert.strictEqual(isValidStudentId('A'.repeat(41)), false);
});

test('accepts valid ids', () => {
  assert.strictEqual(isValidStudentId('SCSDTEST32328372837'), true);
  assert.strictEqual(isValidStudentId('a1_-'), true);
});

test('dedupes last occurrence wins', () => {
  assert.deepStrictEqual(normalizeStudentIds(['aaa', 'bbb', 'aaa']), ['BBB', 'AAA']);
});

test('addStudentId rejects invalid and appends valid', () => {
  const bad = addStudentId([], 'bad id');
  assert.strictEqual(bad.ok, false);
  const good = addStudentId(['AAA'], 'bbb');
  assert.strictEqual(good.ok, true);
  assert.deepStrictEqual(good.student_ids, ['AAA', 'BBB']);
});

console.log('studentIds.test.js: ok');
