'use strict';
/**
 * Auth API Tests
 * Tests: login success, wrong password, missing fields, rate limiting
 */

const request = require('supertest');
const { app }  = require('../server');

// ── Pre-set env for tests ──────────────────────────────────
process.env.NODE_ENV           = 'test';
process.env.JWT_SECRET         = 'test_jwt_secret_key';
process.env.ADMIN_USERNAME     = 'admin';
// bcrypt hash of "WizklubAdmin@2024"
process.env.ADMIN_PASSWORD_HASH = '$2b$12$OYdG47JMJOhoHCmrXfcKkeoHeLKhHUgv7EZdi4DJMWW/wya4DuD1e';

describe('POST /api/admin/login', () => {

  test('✅ returns 200 + JWT token with valid credentials', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'WizklubAdmin@2024' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.').length).toBe(3); // valid JWT = 3 parts
    expect(res.body.expiresIn).toBe(28800); // 8 hours
  });

  test('❌ returns 401 with wrong password', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'wrongpassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials.');
    expect(res.body.token).toBeUndefined();
  });

  test('❌ returns 401 with wrong username', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'hacker', password: 'WizklubAdmin@2024' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('❌ returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'WizklubAdmin@2024' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/required/i);
  });

  test('❌ returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('❌ returns 400 with empty body', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

});
