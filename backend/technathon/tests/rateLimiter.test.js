'use strict';
/**
 * Rate limiter tests in isolation.
 * Verifies upload limiter can be enabled in test mode.
 */

const express = require('express');
const request = require('supertest');

describe('uploadLimiter', () => {
  test('returns 429 after exceeding configured limit', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true';
    process.env.UPLOAD_LIMIT_MAX = '2';
    process.env.UPLOAD_LIMIT_WINDOW_MS = '60000';

    jest.resetModules();
    const { uploadLimiter } = require('../middleware/rateLimiter');

    const app = express();
    app.post('/limited', uploadLimiter, (_req, res) => {
      res.status(200).json({ success: true });
    });

    const first = await request(app).post('/limited');
    const second = await request(app).post('/limited');
    const third = await request(app).post('/limited');

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.body.success).toBe(false);
  });
});
