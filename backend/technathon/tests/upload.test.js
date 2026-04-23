'use strict';
/**
 * Upload API Tests
 * Tests: file required validation + MIME type validation.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key';
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
process.env.ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '$2b$12$OYdG47JMJOhoHCmrXfcKkeoHeLKhHUgv7EZdi4DJMWW/wya4DuD1e';

const request = require('supertest');
const { app } = require('../server');

describe('Upload routes', () => {
  test('returns 400 when no file is sent to document upload', async () => {
    const res = await request(app).post('/api/upload/document');
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no file/i);
  });

  test('returns 415 when invalid MIME is sent to document upload', async () => {
    const res = await request(app)
      .post('/api/upload/document')
      .attach('file', Buffer.from('not-a-document'), {
        filename: 'file.txt',
        contentType: 'text/plain',
      });

    expect(res.statusCode).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid document file type/i);
  });

  test('returns 415 when invalid MIME is sent to video upload', async () => {
    const res = await request(app)
      .post('/api/upload/video')
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'file.pdf',
        contentType: 'application/pdf',
      });

    expect(res.statusCode).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid video file type/i);
  });

  test('returns 400 when studentId is missing for upload', async () => {
    const res = await request(app)
      .post('/api/upload/document')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'file.pdf',
        contentType: 'application/pdf',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '')).toMatch(/studentid is required/i);
  });
});
