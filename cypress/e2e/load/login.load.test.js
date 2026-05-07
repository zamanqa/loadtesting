/**
 * Load test — Login endpoint
 *
 * Tests how the auth service holds up under concurrent logins.
 * Token caching is intentionally disabled here — we want every VU
 * to actually call the login endpoint so we can measure real throughput.
 *
 * Threshold levels:
 *   1. Global  — applies to every request in the test
 *   2. Module  — http_req_duration{module:auth} aggregates the login endpoint
 *   3. Endpoint — http_req_duration{endpoint:auth.login}
 *
 * Run: npm run login:load
 */

import { http, check, sleep, textSummary, BASE_URL, API_VERSION, CONSUMER_KEY, CONSUMER_SECRET } from '../../support/helpers/k6.js';
import { buildHtmlReport } from '../../support/helpers/report.js';
import { buildThresholds } from '../../support/helpers/thresholds.js';

// Change this one constant to adjust the pause between requests globally.
const SLEEP_BETWEEN_REQUESTS = 1; // seconds

// Login is heavier than regular reads so the p95 limit is relaxed to 800ms.
// p99 will default to 1600ms (800 × 2) inside buildThresholds.
const ENDPOINTS = [
  { tag: 'auth.login', p95: 800 },
];

export const options = {
  thresholds: buildThresholds('auth', ENDPOINTS),
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

// Verify that the credentials actually work before we start hammering the endpoint.
export function setup() {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'setup: status 200': (r) => r.status === 200,
    'setup: has token':  (r) => !!JSON.parse(r.body).token,
  });

  if (res.status !== 200) {
    throw new Error(`Credentials rejected during setup (HTTP ${res.status}): ${res.body}`);
  }

  console.log('Credentials validated — starting login load test');
}

export default function () {
  sleep(SLEEP_BETWEEN_REQUESTS);

  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { scenario: 'load', module: 'auth', endpoint: 'auth.login' },
      timeout: '10s',
    }
  );

  check(res, {
    'status 200':      (r) => r.status === 200,
    'has token':       (r) => { try { return !!JSON.parse(r.body).token; }       catch { return false; } },
    'has company_id':  (r) => { try { return !!JSON.parse(r.body).company_id; }  catch { return false; } },
    'under 800ms':     (r) => r.timings.duration < 800,
  });
}

export function teardown() {
  console.log('Login load test complete');
}

const REPORT_CONFIG = {
  title:    'Login Load Test Report',
  subtitle: 'POST /auth/login · 20 VUs · 2 min',
  module:   'auth',
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
