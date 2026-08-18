const assert = require('assert');
const {
  parseLoginResponse,
  rolesIncludePmo,
} = require('../src/services/wizklubApiService');

const sampleResponse = {
  success: true,
  message: 'Login successful',
  data: {
    access_token: 'header.payload.signature',
    expires_in: 3600,
    refresh_token: 'refresh-token',
    user_details: {
      user_id: 'cc8e1ece-ee64-4ac8-8ea4-c31b2136c29c',
      roles: [
        'Employees',
        'Admin',
        'PMO',
        'Instructor',
      ],
      username: 'chandrangshu',
      email: null,
    },
  },
};

assert.strictEqual(rolesIncludePmo(['PMO']), true);
assert.strictEqual(rolesIncludePmo(['Admin']), false);

const parsed = parseLoginResponse(sampleResponse);
assert.strictEqual(parsed.username, 'chandrangshu');
assert.strictEqual(parsed.hasPmoRole, true);
assert.ok(parsed.accessToken);
assert.ok(parsed.refreshToken);

console.log('wizklubApiService.test.js: ok');
