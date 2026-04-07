const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../backend/server.js');

const LOGO_PATH = path.join(__dirname, '..', 'frontend', 'public', 'brand', 'logo.png');

describe('API', () => {
  it('GET /api/health (no Mongo)', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.mongo, false);
    assert.strictEqual(res.body.mongoConfigured, false);
  });

  it('GET /api/me without cookie → 401', async () => {
    const res = await request(app).get('/api/me').expect(401);
    assert.strictEqual(res.body.role, null);
  });

  it('POST /api/login rejects bad credentials', async () => {
    await request(app).post('/api/login').send({ user: 'test_pmo', pass: 'wrong' }).expect(401);
  });

  it('login, /api/me, sessions, PUT no-op, logout', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/login')
      .send({ user: 'test_pmo', pass: 'test-pmo-pass-12' })
      .expect(200);
    assert.strictEqual(login.body.ok, true);
    assert.strictEqual(login.body.role, 'pmo');

    const me = await agent.get('/api/me').set('X-PO-Role', 'pmo').expect(200);
    assert.strictEqual(me.body.role, 'pmo');

    const sessions = await agent.get('/api/sessions').set('X-PO-Role', 'pmo').expect(200);
    assert.deepStrictEqual(sessions.body, []);

    await agent.put('/api/sessions').set('X-PO-Role', 'pmo').send([]).expect(503);

    await agent.post('/api/logout').send({ role: 'pmo' }).expect(200);
    await agent.get('/api/me').set('X-PO-Role', 'pmo').expect(401);
  });

  it('GET / and /app.js', async () => {
    const root = await request(app).get('/').expect(200);
    assert.ok(String(root.text).includes('<html'), 'expected HTML');
    assert.ok(String(root.text).includes('manifest.webmanifest'), 'PWA manifest link');
    if (fs.existsSync(LOGO_PATH)) {
      assert.ok(String(root.text).includes('data:image/png;base64,'), 'logo should be inlined in HTML');
    }

    const js = await request(app).get('/app.js').expect(200);
    assert.ok(js.text.length > 100, 'expected app bundle');
    assert.ok(String(js.text).includes("register('/sw.js'"), 'service worker registration');

    await request(app).get('/react-toastify-bundle.js').expect(200);
    await request(app).get('/react-toastify-bundle.css').expect(200);

    const man = await request(app).get('/manifest.webmanifest').expect(200);
    assert.ok(String(man.headers['content-type'] || '').includes('manifest'), 'manifest content-type');
    const manifestJson = JSON.parse(man.text);
    assert.strictEqual(manifestJson.display, 'standalone');

    const sw = await request(app).get('/sw.js').expect(200);
    assert.ok(sw.text.includes('CACHE_VERSION'), 'service worker body');
    assert.strictEqual(String(sw.headers['cache-control'] || '').toLowerCase(), 'no-store');

    await request(app).get('/pwa-icon.svg').expect(200);

    if (fs.existsSync(LOGO_PATH)) {
      const logo = await request(app).get('/brand/logo.png').expect(200);
      assert.ok(String(logo.headers['content-type'] || '').includes('png'), 'logo content-type');
    }
  });

  it('unknown /api route → 404 JSON', async () => {
    const res = await request(app).get('/api/no-such-endpoint').expect(404);
    assert.strictEqual(res.body.error, 'Unknown API route');
  });
});
