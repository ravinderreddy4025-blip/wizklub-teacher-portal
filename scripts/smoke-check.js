#!/usr/bin/env node
/**
 * Post-deploy smoke check: GET /api/health (no auth).
 * Usage:
 *   node scripts/smoke-check.js
 *   node scripts/smoke-check.js https://orientation.example.org
 *   SMOKE_BASE_URL=https://host npm run smoke
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const baseRaw = process.env.SMOKE_BASE_URL || process.argv[2] || 'http://127.0.0.1:8080';
const base = String(baseRaw).replace(/\/$/, '');
const target = new URL(`${base}/api/health`);
const lib = target.protocol === 'https:' ? https : http;

const req = lib.request(
  target,
  {
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeout: 15_000,
  },
  (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        console.error(`[smoke] FAIL: non-JSON response (HTTP ${res.statusCode})`);
        console.error(text.slice(0, 500));
        process.exitCode = 1;
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error(`[smoke] FAIL: HTTP ${res.statusCode}`, body);
        process.exitCode = 1;
        return;
      }
      if (!body || body.ok !== true) {
        console.error('[smoke] FAIL: body.ok is not true', body);
        process.exitCode = 1;
        return;
      }
      console.log(
        `[smoke] OK ${target.href} → ok=${body.ok} mongo=${body.mongo} mongoConfigured=${body.mongoConfigured}`
      );
      if (body.mongoConfigured && body.mongo === false) {
        console.warn('[smoke] WARN: MongoDB configured but ping returned false — check DB connectivity.');
        process.exitCode = 2;
      }
    });
  }
);

req.on('timeout', () => {
  req.destroy();
  console.error(`[smoke] FAIL: timeout ${target.href}`);
  process.exitCode = 1;
});

req.on('error', (e) => {
  console.error(`[smoke] FAIL: could not reach ${target.href}`);
  console.error(e && e.message ? e.message : e);
  process.exitCode = 1;
});

req.end();
