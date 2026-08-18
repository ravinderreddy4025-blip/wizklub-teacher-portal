const assert = require('assert');
const { validatePasswordStrength } = require('../src/utils/passwordUtils');

function test(name, fn) {
  fn();
  console.log(`ok — ${name}`);
}

test('rejects empty password', () => {
  assert.strictEqual(validatePasswordStrength(''), 'Password is required.');
  assert.strictEqual(validatePasswordStrength(null), 'Password is required.');
});

test('rejects short passwords in non-production', () => {
  assert.ok(validatePasswordStrength('short'));
  assert.match(validatePasswordStrength('1234567'), /at least 8/);
});

test('rejects known weak passwords', () => {
  assert.strictEqual(validatePasswordStrength('password123'), 'Password is too weak.');
  assert.strictEqual(validatePasswordStrength('Admin123'), 'Password is too weak.');
});

test('accepts a reasonably strong password', () => {
  assert.strictEqual(validatePasswordStrength('LocalUser!234'), null);
});

console.log('passwordUtils.test.js: ok');
