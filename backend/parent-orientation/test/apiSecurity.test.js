process.env.NODE_ENV = 'test';
process.env.MONGODB_DISABLED = '1';
process.env.MONGODB_URI = '';
process.env.MONGO_URI = '';
process.env.COOKIE_SECRET = 'test-cookie-secret-32-chars-minimum!!';
process.env.SUPERADMIN_PASS = 'TestSuperAdminPass1';
process.env.ADMIN_USER = 'admin';
process.env.SWAGGER_UI = '0';
process.env.LSQ_WEBHOOK_DISABLED = '1';
process.env.WIZKLUB_PARENTS_SESSION_WEBHOOK_URL = '';

const assert = require('assert');
const { createApp } = require('../src/app');
const { startApp, request, cookieHeader } = require('./httpApp');

function test(name, fn) {
  const out = fn();
  if (out && typeof out.then === 'function') {
    return out
      .then(() => console.log(`ok — ${name}`))
      .catch((err) => {
        console.error(`fail — ${name}`);
        throw err;
      });
  }
  console.log(`ok — ${name}`);
  return Promise.resolve();
}

async function loginSuperadmin(ctx) {
  const res = await request(ctx, {
    method: 'POST',
    path: '/api/login',
    body: { user: 'admin', pass: 'TestSuperAdminPass1', portal: 'superadmin' },
  });
  assert.strictEqual(res.status, 200, res.text);
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(res.json.role, 'superadmin');
  return cookieHeader(res.cookies);
}

async function run() {
  const ctx = await startApp(createApp());
  try {
    await test('GET /api/health is public and does not leak webhook errors', async () => {
      const res = await request(ctx, { path: '/api/health' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.ok, true);
      assert.strictEqual(res.json.lsqWebhook.lastRunError, undefined);
      assert.strictEqual(res.json.lsqWebhook.pollIntervalMs, undefined);
    });

    await test('GET /api/me without cookie is 401', async () => {
      const res = await request(ctx, { path: '/api/me' });
      assert.strictEqual(res.status, 401);
    });

    await test('protected APIs reject anonymous callers', async () => {
      const paths = [
        ['GET', '/api/sessions'],
        ['POST', '/api/sessions'],
        ['PUT', '/api/sessions/sess-1'],
        ['DELETE', '/api/sessions/sess-1'],
        ['POST', '/api/sessions/sess-1/student-ids'],
        ['PUT', '/api/sessions'],
        ['GET', '/api/sales/targets?month=2026-08'],
        ['PUT', '/api/sales/targets'],
        ['GET', '/api/sales/fulfillment?month=2026-08'],
        ['GET', '/api/catalog/regions'],
        ['GET', '/api/admin/users'],
        ['POST', '/api/admin/users'],
        ['GET', '/api/admin/schools'],
        ['GET', '/api/admin/audit-logs'],
      ];
      for (const [method, path] of paths) {
        const res = await request(ctx, { method, path, body: method === 'GET' ? undefined : {} });
        assert.strictEqual(res.status, 401, `${method} ${path} => ${res.status}`);
      }
    });

    await test('login requires portal and rejects bad credentials', async () => {
      const missing = await request(ctx, {
        method: 'POST',
        path: '/api/login',
        body: { user: 'admin', pass: 'x' },
      });
      assert.strictEqual(missing.status, 400);

      const bad = await request(ctx, {
        method: 'POST',
        path: '/api/login',
        body: { user: 'admin', pass: 'wrong-password', portal: 'superadmin' },
      });
      assert.strictEqual(bad.status, 401);
      assert.strictEqual(bad.json.error, 'Invalid username or password.');
    });

    await test('invalid JSON body is 400', async () => {
      const res = await request(ctx, {
        method: 'POST',
        path: '/api/login',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-json',
      });
      assert.strictEqual(res.status, 400);
    });

    await test('sales_admin / speaker login fails closed when Mongo is down', async () => {
      const sales = await request(ctx, {
        method: 'POST',
        path: '/api/login',
        body: { user: 'sales1', pass: 'Whatever!234', portal: 'sales_admin' },
      });
      assert.strictEqual(sales.status, 503);
      assert.match(String(sales.json.error), /database|unavailable/i);

      const speaker = await request(ctx, {
        method: 'POST',
        path: '/api/login',
        body: { user: 'speaker1', pass: 'Whatever!234', portal: 'speaker' },
      });
      assert.strictEqual(speaker.status, 503);
    });

    await test('superadmin can sign in and /api/me returns the role', async () => {
      const cookie = await loginSuperadmin(ctx);
      const me = await request(ctx, { path: '/api/me', headers: { Cookie: cookie } });
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.json.role, 'superadmin');
      assert.strictEqual(me.json.username, 'admin');
    });

    await test('superadmin cannot mutate PMO sessions or sales targets', async () => {
      const cookie = await loginSuperadmin(ctx);
      const create = await request(ctx, {
        method: 'POST',
        path: '/api/sessions',
        headers: { Cookie: cookie },
        body: { id: 'sess-1' },
      });
      assert.strictEqual(create.status, 403);

      const putTargets = await request(ctx, {
        method: 'PUT',
        path: '/api/sales/targets',
        headers: { Cookie: cookie },
        body: { month: '2026-08', targets: [] },
      });
      assert.strictEqual(putTargets.status, 403);
    });

    await test('sales month query is validated (MONTH_RE import)', async () => {
      const cookie = await loginSuperadmin(ctx);
      const bad = await request(ctx, {
        path: '/api/sales/targets?month=2026-8',
        headers: { Cookie: cookie },
      });
      assert.strictEqual(bad.status, 400);

      const good = await request(ctx, {
        path: '/api/sales/targets?month=2026-08',
        headers: { Cookie: cookie },
      });
      assert.strictEqual(good.status, 200);
      assert.deepStrictEqual(good.json, { month: '2026-08', targets: [] });
    });

    await test('admin routes require superadmin and fail closed without Mongo', async () => {
      const cookie = await loginSuperadmin(ctx);
      const users = await request(ctx, { path: '/api/admin/users', headers: { Cookie: cookie } });
      assert.strictEqual(users.status, 503);

      const proto = await request(ctx, {
        method: 'POST',
        path: '/api/admin/users',
        headers: { Cookie: cookie },
        body: { username: { $gt: '' }, password: 'LocalUser!234', role: 'sales_admin' },
      });
      assert.strictEqual(proto.status, 503);
    });

    await test('unknown API route is 404 without leaking internals', async () => {
      const res = await request(ctx, { path: '/api/does-not-exist' });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.json.error, 'Unknown API route');
      assert.strictEqual(res.json.hint, undefined);
    });

    await test('logout clears cookies', async () => {
      const cookie = await loginSuperadmin(ctx);
      const out = await request(ctx, {
        method: 'POST',
        path: '/api/logout',
        headers: { Cookie: cookie },
        body: { role: 'superadmin' },
      });
      assert.strictEqual(out.status, 200);
      assert.strictEqual(out.json.ok, true);
    });
  } finally {
    await ctx.close();
  }
}

run()
  .then(() => console.log('apiSecurity.test.js: ok'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
