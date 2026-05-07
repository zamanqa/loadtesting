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
import { ms, pct, getMetric, passed } from '../../support/helpers/report.js';

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

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/login-load-report.html': buildHtmlReport(data),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

function buildHtmlReport(data) {
  const runAt    = new Date().toUTCString();
  const dur      = getMetric(data, 'http_req_duration{endpoint:auth.login}');
  const fail     = getMetric(data, 'http_req_failed{endpoint:auth.login}');
  const reqs     = getMetric(data, 'http_reqs{endpoint:auth.login}');
  const ok       = passed(data, 'http_req_duration{endpoint:auth.login}');
  const allOk    = passed(data, 'http_req_duration') !== false &&
                   passed(data, 'http_req_failed') !== false;
  const p95Val   = dur ? dur['p(95)'] : null;
  const p95Class = p95Val != null ? (p95Val < 800 ? 'good' : 'bad') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Load Test Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f5f7fa; color: #333; }
    .header { background: #1a2340; color: #fff; padding: 28px 40px; }
    .header h1 { margin: 0 0 6px; font-size: 1.6rem; }
    .header p { margin: 0; opacity: 0.7; font-size: 0.9rem; }
    .summary { display: flex; gap: 16px; flex-wrap: wrap; padding: 24px 40px; background: #fff; border-bottom: 1px solid #e0e4eb; }
    .stat { flex: 1; min-width: 130px; background: #f5f7fa; border-radius: 8px; padding: 16px 20px; text-align: center; }
    .stat .label { font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .stat .value { font-size: 1.4rem; font-weight: 700; }
    .result-badge { font-size: 1rem; font-weight: 700; padding: 6px 18px; border-radius: 6px; display: inline-block; }
    .result-pass { background: #d4edda; color: #155724; }
    .result-fail { background: #f8d7da; color: #721c24; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); margin: 24px 40px; border-top: 4px solid ${ok === false ? '#dc3545' : '#28a745'}; }
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px 8px; }
    .endpoint-label { font-weight: 600; font-size: 0.95rem; }
    .badge { font-size: 0.76rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; }
    .badge.pass { background: #d4edda; color: #155724; }
    .badge.fail { background: #f8d7da; color: #721c24; }
    .metrics-table { width: 100%; border-collapse: collapse; }
    .metrics-table th, .metrics-table td { padding: 8px 20px; font-size: 0.86rem; border-top: 1px solid #f0f2f5; text-align: left; }
    .metrics-table th { background: #f8f9fa; font-weight: 600; color: #555; }
    .good { color: #155724; font-weight: 600; }
    .bad  { color: #721c24; font-weight: 600; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 0.78rem; }
  </style>
</head>
<body>

  <div class="header">
    <h1>Login Load Test Report</h1>
    <p>POST /auth/login &nbsp;·&nbsp; 20 VUs &nbsp;·&nbsp; 2 min &nbsp;·&nbsp; ${runAt}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="label">Result</div>
      <div class="value">
        <span class="result-badge ${allOk ? 'result-pass' : 'result-fail'}">
          ${allOk ? '✅ PASSED' : '❌ FAILED'}
        </span>
      </div>
    </div>
    <div class="stat">
      <div class="label">Total Logins</div>
      <div class="value">${reqs ? Math.round(reqs.count || 0).toLocaleString() : '—'}</div>
    </div>
    <div class="stat">
      <div class="label">Error Rate</div>
      <div class="value ${fail && fail.rate > 0.01 ? 'bad' : 'good'}">${pct(fail ? fail.rate : null)}</div>
    </div>
    <div class="stat">
      <div class="label">p95</div>
      <div class="value ${p95Class}">${ms(p95Val)}</div>
    </div>
    <div class="stat">
      <div class="label">avg</div>
      <div class="value">${ms(dur ? dur.avg : null)}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="endpoint-label">POST /${API_VERSION}/auth/login</span>
      <span class="badge ${ok === false ? 'fail' : 'pass'}">${ok === false ? '❌ FAIL' : '✅ PASS'}</span>
    </div>
    <table class="metrics-table">
      <tr><th>Metric</th><th>Value</th><th>Threshold</th></tr>
      <tr><td>Total requests</td><td>${reqs ? Math.round(reqs.count || 0).toLocaleString() : '—'}</td><td>—</td></tr>
      <tr><td>Error rate</td><td class="${fail && fail.rate > 0.01 ? 'bad' : 'good'}">${pct(fail ? fail.rate : null)}</td><td>&lt; 1%</td></tr>
      <tr><td>avg</td><td>${ms(dur ? dur.avg : null)}</td><td>—</td></tr>
      <tr><td>min</td><td>${ms(dur ? dur.min : null)}</td><td>—</td></tr>
      <tr><td>p50</td><td>${ms(dur ? dur.med : null)}</td><td>—</td></tr>
      <tr><td class="${p95Class}">p95</td><td class="${p95Class}">${ms(p95Val)}</td><td class="${p95Class}">&lt; 800 ms</td></tr>
      <tr><td>p99</td><td>${ms(dur ? dur['p(99)'] : null)}</td><td>—</td></tr>
      <tr><td>max</td><td>${ms(dur ? dur.max : null)}</td><td>—</td></tr>
    </table>
  </div>

  <div class="footer">
    Generated by k6 &nbsp;·&nbsp; Circuly Login Load Test &nbsp;·&nbsp; ${runAt}
  </div>

</body>
</html>`;
}
