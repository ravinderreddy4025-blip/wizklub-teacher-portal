const assert = require('assert');
const {
  parseRoleCookie,
  roleCookieValue,
  sanitizeCookieUsername,
  isSuperAdminCredentials,
  resolveAuthRole,
} = require('../src/middleware/auth');
const { ADMIN_USER, SUPERADMIN_PASS } = require('../src/config/env');

function test(name, fn) {
  fn();
  console.log(`ok — ${name}`);
}

test('parseRoleCookie accepts role|username and legacy role-only', () => {
  assert.deepStrictEqual(parseRoleCookie('pmo|alice', 'pmo'), { role: 'pmo', username: 'alice' });
  assert.deepStrictEqual(parseRoleCookie('pmo', 'pmo'), { role: 'pmo', username: 'pmo' });
  assert.strictEqual(parseRoleCookie('speaker|bob', 'pmo'), null);
  assert.strictEqual(parseRoleCookie('', 'pmo'), null);
});

test('cookie username strips pipe and control characters', () => {
  assert.strictEqual(sanitizeCookieUsername('alice|admin'), 'aliceadmin');
  assert.strictEqual(sanitizeCookieUsername('a\nb'), 'ab');
  assert.ok(roleCookieValue('sales_admin', 'alice|x').startsWith('sales_admin|'));
  assert.ok(!roleCookieValue('sales_admin', 'alice|x').includes('alice|x'));
});

test('superadmin credentials are case-insensitive on username', () => {
  assert.strictEqual(isSuperAdminCredentials(ADMIN_USER, SUPERADMIN_PASS), true);
  assert.strictEqual(isSuperAdminCredentials(String(ADMIN_USER).toUpperCase(), SUPERADMIN_PASS), true);
  assert.strictEqual(isSuperAdminCredentials(ADMIN_USER, 'wrong-pass'), false);
});

test('resolveAuthRole uses X-PO-Role when multiple cookies exist', () => {
  const req = {
    get: (h) => (String(h).toLowerCase() === 'x-po-role' ? 'speaker' : ''),
    query: {},
    signedCookies: {
      po_auth_pmo: 'pmo|alice',
      po_auth_speaker: 'speaker|bob',
    },
  };
  assert.strictEqual(resolveAuthRole(req), 'speaker');
  assert.strictEqual(req.authUser.username, 'bob');
});

test('resolveAuthRole refuses to guess when multiple cookies and no role hint', () => {
  const req = {
    get: () => '',
    query: {},
    signedCookies: {
      po_auth_pmo: 'pmo|alice',
      po_auth_speaker: 'speaker|bob',
    },
  };
  assert.strictEqual(resolveAuthRole(req), null);
});

console.log('authMiddleware.test.js: ok');
