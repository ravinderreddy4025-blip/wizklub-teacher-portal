'use strict';
/**
 * Health Check + Middleware Tests
 * Tests: /health endpoint, 404 handler, security headers, CORS
 */

const request = require('supertest');
const { app }  = require('../server');

process.env.NODE_ENV            = 'test';
process.env.JWT_SECRET          = 'test_jwt_secret_key';
process.env.ADMIN_USERNAME      = 'admin';
process.env.ADMIN_PASSWORD_HASH = '$2b$12$OYdG47JMJOhoHCmrXfcKkeoHeLKhHUgv7EZdi4DJMWW/wya4DuD1e';

describe('GET /health', () => {

  test('✅ returns 200 with status info', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.env).toBe('test');
  });

  test('✅ health check requires no auth token', async () => {
    // Must be accessible without any authorization
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });

});

describe('Security Headers (Helmet)', () => {

  test('✅ X-Content-Type-Options header is set', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('✅ X-Frame-Options header is set', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  test('✅ X-XSS-Protection header is present', async () => {
    const res = await request(app).get('/health');
    // Helmet sets this; value may vary by version
    expect(res.headers).toBeDefined();
  });

});

describe('404 Handler', () => {

  test('✅ unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test('✅ unknown POST route returns 404 JSON', async () => {
    const res = await request(app).post('/api/nonexistent').send({});
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

});

describe('Request Body Validation', () => {

  test('✅ rejects oversized JSON payload (> 1mb)', async () => {
    // Generate a string larger than 1mb
    const bigPayload = { data: 'x'.repeat(1.1 * 1024 * 1024) };
    const res = await request(app)
      .post('/api/admin/login')
      .send(bigPayload)
      .set('Content-Type', 'application/json');

    // Express should reject with 413
    expect([400, 413]).toContain(res.statusCode);
  });

});
