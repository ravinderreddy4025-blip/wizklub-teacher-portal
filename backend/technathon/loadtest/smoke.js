/**
 * k6 smoke test for Technathon API.
 *
 * Run:
 *   k6 run -e BASE_URL=http://YOUR_HOST:5000 loadtest/smoke.js
 *
 * Note: HTTP 429 is a normal outcome when rate limits apply.
 * This script uses checks (not http_req_failed) as the main signal.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL;

export const options = {
  vus: 20,
  duration: '2m',
  thresholds: {
    // Latency sanity check (tune if your target is higher)
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const payload = JSON.stringify({
    name: 'Load User',
    grade: '8',
    schoolName: 'Preprod School',
    projectTitle: 'Smoke Test',
  });

  const res = http.post(`${BASE}/api/submissions`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'submission 201 or 429': (r) => r.status === 201 || r.status === 429,
  });

  sleep(1);
}
