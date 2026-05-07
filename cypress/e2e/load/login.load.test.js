// scenario: load — login endpoint (100 VUs, 8 min)
// tests POST /auth/login throughput and response time under normal expected traffic
import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL        = __ENV.BASE_URL;
const API_VERSION     = __ENV.API_VERSION     || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY;
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET;

export const options = {
  thresholds: {
    // selector: login is heavier than read endpoints — allow up to 800ms p95
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.01'],
    'http_req_duration{endpoint:auth.login}': ['p(95)<800'],
  },
  scenarios: {
    load: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '30s', target: 10 }, // ramp up
        { duration: '60s', target: 20 }, // hold — normal traffic
        { duration: '30s', target: 0   }, // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

// action: smoke-check credentials once before VUs start
export function setup() {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'setup: login 200':    (r) => r.status === 200,
    'setup: token exists': (r) => !!JSON.parse(r.body).token,
  });

  if (res.status !== 200) {
    throw new Error(`[login:load] setup failed — credentials rejected: ${res.status} ${res.body}`);
  }

  console.log('[login:load] Credentials validated. Starting load test...');
}

// action: each VU iteration calls login — deliberately not caching, login throughput is what we measure
export default function () {
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags:    { scenario: 'load', endpoint: 'auth.login' },
    timeout: '10s',
  };

  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    params
  );

  check(res, {
    'login: status 200':    (r) => r.status === 200,
    'login: token exists':  (r) => {
      try { return !!JSON.parse(r.body).token; } catch { return false; }
    },
    'login: company_id exists': (r) => {
      try { return !!JSON.parse(r.body).company_id; } catch { return false; }
    },
    'login: under 800ms':   (r) => r.timings.duration < 800,
  });

  sleep(1);
}

export function teardown() {
  console.log('[login:load] Run complete.');
}

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/login-load-report.html': buildHtmlReport(data),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

// --- helpers ---

function ms(val)  { return val != null ? `${Math.round(val)} ms` : '—'; }
function pct(val) { return val != null ? `${(val * 100).toFixed(1)}%` : '—'; }

function metricVals(data, key) {
  const m = data.metrics[key];
  return m ? m.values : null;
}

function thresholdOk(data, key) {
  const t = data.thresholds && data.thresholds[key];
  if (!t) return null;
  return t.ok !== false;
}

function buildHtmlReport(data) {
  const runAt       = new Date().toUTCString();
  const dur         = metricVals(data, 'http_req_duration{endpoint:auth.login}');
  const failed      = metricVals(data, 'http_req_failed{endpoint:auth.login}');
  const reqs        = metricVals(data, 'http_reqs{endpoint:auth.login}');
  const tOk         = thresholdOk(data, 'http_req_duration{endpoint:auth.login}');
  const globalOk    = thresholdOk(data, 'http_req_duration') !== false &&
                      thresholdOk(data, 'http_req_failed')   !== false;
  const p95Val      = dur ? dur['p(95)'] : null;
  const p95Class    = p95Val != null ? (p95Val < 800 ? 'good' : 'bad') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Load Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f5f7fa; color: #333; }
    .header { background: #1a2340; color: #fff; padding: 28px 40px; }
    .header h1 { margin: 0 0 6px; font-size: 1.6rem; }
    .header p  { margin: 0; opacity: 0.75; font-size: 0.9rem; }
    .summary { display: flex; gap: 20px; flex-wrap: wrap; padding: 24px 40px; background: #fff; border-bottom: 1px solid #e0e4eb; }
    .stat { flex: 1; min-width: 140px; background: #f5f7fa; border-radius: 8px; padding: 16px 20px; text-align: center; }
    .stat .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .stat .value { font-size: 1.5rem; font-weight: 700; }
    .overall-badge { font-size: 1.1rem; font-weight: 700; padding: 8px 22px; border-radius: 6px; display: inline-block; }
    .overall-pass { background: #d4edda; color: #155724; }
    .overall-fail { background: #f8d7da; color: #721c24; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); margin: 24px 40px; border-top: 4px solid ${tOk === false ? '#dc3545' : '#28a745'}; }
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px 8px; }
    .endpoint-label { font-weight: 600; font-size: 1rem; }
    .badge { font-size: 0.78rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; }
    .badge.pass { background: #d4edda; color: #155724; }
    .badge.fail { background: #f8d7da; color: #721c24; }
    .metrics-table { width: 100%; border-collapse: collapse; }
    .metrics-table th, .metrics-table td { padding: 9px 20px; text-align: left; font-size: 0.88rem; border-top: 1px solid #f0f2f5; }
    .metrics-table th { background: #f8f9fa; font-weight: 600; color: #555; }
    .good { color: #155724; font-weight: 600; }
    .bad  { color: #721c24; font-weight: 600; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Login Load Test Report</h1>
    <p>Endpoint: POST /auth/login &nbsp;|&nbsp; Scenario: 100 VUs, 8 min &nbsp;|&nbsp; Run: ${runAt}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="label">Overall Result</div>
      <div class="value">
        <span class="overall-badge ${globalOk ? 'overall-pass' : 'overall-fail'}">
          ${globalOk ? '✅ PASSED' : '❌ FAILED'}
        </span>
      </div>
    </div>
    <div class="stat">
      <div class="label">Total Logins</div>
      <div class="value">${reqs ? Math.round(reqs.count || 0).toLocaleString() : '—'}</div>
    </div>
    <div class="stat">
      <div class="label">Error Rate</div>
      <div class="value ${failed && failed.rate > 0.01 ? 'bad' : 'good'}">${pct(failed ? failed.rate : null)}</div>
    </div>
    <div class="stat">
      <div class="label">p95 Response</div>
      <div class="value ${p95Class}">${ms(p95Val)}</div>
    </div>
    <div class="stat">
      <div class="label">avg Response</div>
      <div class="value">${ms(dur ? dur.avg : null)}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="endpoint-label">POST /${API_VERSION}/auth/login</span>
      <span class="badge ${tOk === false ? 'fail' : 'pass'}">${tOk === false ? '❌ FAIL' : '✅ PASS'}</span>
    </div>
    <table class="metrics-table">
      <tr><th>Metric</th><th>Value</th><th>Threshold</th></tr>
      <tr><td>Requests (total)</td><td>${reqs ? Math.round(reqs.count || 0).toLocaleString() : '—'}</td><td>—</td></tr>
      <tr><td>Error rate</td><td class="${failed && failed.rate > 0.01 ? 'bad' : 'good'}">${pct(failed ? failed.rate : null)}</td><td>&lt; 1%</td></tr>
      <tr><td>avg</td><td>${ms(dur ? dur.avg : null)}</td><td>—</td></tr>
      <tr><td>min</td><td>${ms(dur ? dur.min : null)}</td><td>—</td></tr>
      <tr><td>p50 (median)</td><td>${ms(dur ? dur.med : null)}</td><td>—</td></tr>
      <tr><td class="${p95Class}">p95</td><td class="${p95Class}">${ms(p95Val)}</td><td class="${p95Class}">&lt; 800 ms</td></tr>
      <tr><td>p99</td><td>${ms(dur ? dur['p(99)'] : null)}</td><td>—</td></tr>
      <tr><td>max</td><td>${ms(dur ? dur.max : null)}</td><td>—</td></tr>
    </table>
  </div>

  <div class="footer">
    Generated by k6 handleSummary &nbsp;|&nbsp; Circuly Login Load Test &nbsp;|&nbsp; ${runAt}
  </div>
</body>
</html>`;
}

