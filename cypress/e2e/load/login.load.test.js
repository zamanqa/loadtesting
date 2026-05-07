/**
 * Load test — Login endpoint
 *
 * Tests how the auth service holds up under concurrent logins.
 * Token caching is intentionally disabled here — we want every VU
 * to actually call the login endpoint so we can measure real throughput.
 *
 * Run: npm run login:load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { buildHtmlReport } from '../../support/helpers/report.js';

const BASE_URL        = __ENV.BASE_URL;
const API_VERSION     = __ENV.API_VERSION || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY;
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET;

export const options = {
  thresholds: {
    // Login is heavier than regular reads, so we allow up to 800ms
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.01'],
    'http_req_duration{endpoint:auth.login}': ['p(95)<800'],
  },
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // ramp up
        { duration: '60s', target: 20 }, // hold
        { duration: '30s', target: 0 },  // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

// Verify that the credentials actually work before we start hammering the endpoint
export function setup() {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'setup: status 200':   (r) => r.status === 200,
    'setup: has token':    (r) => !!JSON.parse(r.body).token,
  });

  if (res.status !== 200) {
    throw new Error(`Credentials rejected during setup (HTTP ${res.status}): ${res.body}`);
  }

  console.log('Credentials validated — starting login load test');
}

export default function () {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { scenario: 'load', endpoint: 'auth.login' },
      timeout: '10s',
    }
  );

  check(res, {
    'status 200':      (r) => r.status === 200,
    'has token':       (r) => { try { return !!JSON.parse(r.body).token; }       catch { return false; } },
    'has company_id':  (r) => { try { return !!JSON.parse(r.body).company_id; }  catch { return false; } },
    'under 800ms':     (r) => r.timings.duration < 800,
  });

  sleep(1);
}

export function teardown() {
  console.log('Login load test complete');
}

const REPORT_CONFIG = {
  title: 'Login Load Test Report',
  subtitle: 'POST /auth/login · 20 VUs · 2 min',
  endpoints: [
    { tag: 'auth.login', label: 'POST /auth/login', p95limit: 800 },
  ],
};

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/login-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
