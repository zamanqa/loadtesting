/**
 * Load test — Orders module (all GET endpoints)
 *
 * Covers 6 endpoints:
 *   GET /orders                              (list)
 *   GET /orders/:id                          (by ID)
 *   GET /orders/:id/payment-update-link
 *   GET /orders/:id/payment-details
 *   GET /orders?page=1&per_page=100&sort=... (filter)
 *   GET /orders?search=:id                  (search)
 *
 * Run: npm run orders:load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { getToken, setupAuth } from '../../support/helpers/auth.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL    = __ENV.BASE_URL;
const API_VERSION = __ENV.API_VERSION || '2026-04';

export const options = {
  thresholds: {
    // Global thresholds apply to every request in this test
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],

    // Per-endpoint thresholds — payment sub-resources are slower by nature
    'http_req_duration{endpoint:order.get_list}':                ['p(95)<500'],
    'http_req_duration{endpoint:order.get_by_id}':               ['p(95)<500'],
    'http_req_duration{endpoint:order.get_payment_update_link}': ['p(95)<800'],
    'http_req_duration{endpoint:order.get_payment_details}':     ['p(95)<800'],
    'http_req_duration{endpoint:order.get_by_filter}':           ['p(95)<500'],
    'http_req_duration{endpoint:order.get_by_search}':           ['p(95)<500'],
  },
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 }, // ramp up
        { duration: '5m', target: 100 }, // hold at normal traffic
        { duration: '1m', target: 0 },   // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

// Runs once before any VU starts.
// Validates credentials and picks up a real orderId from the DB so
// we don't have to hardcode anything in the test.
export function setup() {
  const { token, companyId } = setupAuth();

  const res = http.get(
    `${BASE_URL}/${API_VERSION}/${companyId}/circulydb/orders?page=1&per_page=1`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  let orderId = null;

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    orderId = body.data && body.data.length > 0 ? body.data[0].order_id : null;

    if (orderId) {
      console.log(`Using orderId: ${orderId}`);
    } else {
      console.warn('No orders found — endpoints that need an orderId will be skipped');
    }
  } else {
    console.error(`Could not fetch orders in setup (HTTP ${res.status})`);
  }

  return { orderId };
}

// Each VU runs this on every iteration.
// getToken() handles token caching and auto-refresh per VU.
export default function ({ orderId }) {
  const { token, companyId } = getToken();
  const base = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb`;

  const params = (endpoint) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', endpoint },
    timeout: '10s',
  });

  // GET /orders — paginated list
  const listRes = http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('order.get_list')
  );
  check(listRes, {
    'get_list: status 200':  (r) => r.status === 200,
    'get_list: has data':    (r) => Array.isArray(JSON.parse(r.body).data),
    'get_list: under 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);

  // GET /orders/:id
  if (orderId) {
    const byIdRes = http.get(`${base}/orders/${orderId}`, params('order.get_by_id'));
    check(byIdRes, {
      'get_by_id: status 200':   (r) => r.status === 200,
      'get_by_id: has order_id': (r) => !!JSON.parse(r.body).order_id,
      'get_by_id: under 500ms':  (r) => r.timings.duration < 500,
    });
  }
  sleep(1);

  // GET /orders/:id/payment-update-link
  if (orderId) {
    const linkRes = http.get(
      `${base}/orders/${orderId}/payment-update-link`,
      params('order.get_payment_update_link')
    );
    check(linkRes, {
      'payment_update_link: status 200':  (r) => r.status === 200,
      'payment_update_link: under 800ms': (r) => r.timings.duration < 800,
    });
  }
  sleep(1);

  // GET /orders/:id/payment-details
  if (orderId) {
    const detailsRes = http.get(
      `${base}/orders/${orderId}/payment-details`,
      params('order.get_payment_details')
    );
    check(detailsRes, {
      'payment_details: status 200':  (r) => r.status === 200,
      'payment_details: under 800ms': (r) => r.timings.duration < 800,
    });
  }
  sleep(1);

  // GET /orders — with explicit filter params
  const filterRes = http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('order.get_by_filter')
  );
  check(filterRes, {
    'get_by_filter: status 200':  (r) => r.status === 200,
    'get_by_filter: has data':    (r) => Array.isArray(JSON.parse(r.body).data),
    'get_by_filter: under 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);

  // GET /orders?search=:orderId
  if (orderId) {
    const searchRes = http.get(
      `${base}/orders?search=${orderId}&sort=created_at&desc=true`,
      params('order.get_by_search')
    );
    check(searchRes, {
      'get_by_search: status 200':  (r) => r.status === 200,
      'get_by_search: has data':    (r) => Array.isArray(JSON.parse(r.body).data),
      'get_by_search: under 500ms': (r) => r.timings.duration < 500,
    });
  }
  sleep(1);
}

export function teardown({ orderId }) {
  console.log(`Orders load test complete. orderId used: ${orderId}`);
}

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/orders-load-report.html': buildHtmlReport(data),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

// ─── Report helpers ───────────────────────────────────────────────────────────

function ms(val) {
  return val != null ? `${Math.round(val)} ms` : '—';
}

function pct(val) {
  return val != null ? `${(val * 100).toFixed(1)}%` : '—';
}

function getMetric(data, key) {
  return data.metrics[key] ? data.metrics[key].values : null;
}

function passed(data, key) {
  const t = data.thresholds && data.thresholds[key];
  return t ? t.ok !== false : null;
}

const ENDPOINTS = [
  { tag: 'order.get_list',                label: 'GET /orders (list)',                        p95limit: 500 },
  { tag: 'order.get_by_id',               label: 'GET /orders/:id',                           p95limit: 500 },
  { tag: 'order.get_payment_update_link', label: 'GET /orders/:id/payment-update-link',        p95limit: 800 },
  { tag: 'order.get_payment_details',     label: 'GET /orders/:id/payment-details',            p95limit: 800 },
  { tag: 'order.get_by_filter',           label: 'GET /orders (filter)',                       p95limit: 500 },
  { tag: 'order.get_by_search',           label: 'GET /orders?search=:id',                     p95limit: 500 },
];

function buildHtmlReport(data) {
  const runAt       = new Date().toUTCString();
  const globalDur   = getMetric(data, 'http_req_duration');
  const globalFail  = getMetric(data, 'http_req_failed');
  const globalReqs  = getMetric(data, 'http_reqs');
  const allPassed   = passed(data, 'http_req_duration') !== false &&
                      passed(data, 'http_req_failed') !== false;

  // Find the slowest endpoint by p95
  let slowestTag = null;
  let slowestP95 = 0;
  ENDPOINTS.forEach(({ tag }) => {
    const dur = getMetric(data, `http_req_duration{endpoint:${tag}}`);
    if (dur && dur['p(95)'] > slowestP95) {
      slowestP95 = dur['p(95)'];
      slowestTag = tag;
    }
  });

  const cards = ENDPOINTS.map(({ tag, label, p95limit }) => {
    const dur    = getMetric(data, `http_req_duration{endpoint:${tag}}`);
    const fail   = getMetric(data, `http_req_failed{endpoint:${tag}}`);
    const reqs   = getMetric(data, `http_reqs{endpoint:${tag}}`);
    const ok     = passed(data, `http_req_duration{endpoint:${tag}}`);
    const p95Val = dur ? dur['p(95)'] : null;
    const skipped = !dur;

    const badge = skipped
      ? `<span class="badge skip">SKIPPED</span>`
      : ok === false
        ? `<span class="badge fail">❌ FAIL</span>`
        : `<span class="badge pass">✅ PASS</span>`;

    const p95Class = p95Val != null ? (p95Val < p95limit ? 'good' : 'bad') : '';

    return `
    <div class="card ${skipped ? 'skipped' : ok === false ? 'failed' : 'passed'}">
      <div class="card-header">
        <span class="endpoint-label">${label}</span>
        ${badge}
      </div>
      <div class="card-meta">Tag: <code>${tag}</code> &nbsp;|&nbsp; p95 limit: <code>${p95limit} ms</code></div>
      ${skipped
        ? `<p class="skip-note">Not called — orderId was not available.</p>`
        : `<table class="metrics-table">
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Total requests</td><td>${reqs ? Math.round(reqs.count || 0).toLocaleString() : '—'}</td></tr>
        <tr><td>Error rate</td><td class="${fail && fail.rate > 0.01 ? 'bad' : 'good'}">${pct(fail ? fail.rate : null)}</td></tr>
        <tr><td>avg</td><td>${ms(dur ? dur.avg : null)}</td></tr>
        <tr><td>min</td><td>${ms(dur ? dur.min : null)}</td></tr>
        <tr><td>p50</td><td>${ms(dur ? dur.med : null)}</td></tr>
        <tr><td class="${p95Class}">p95</td><td class="${p95Class}">${ms(p95Val)}</td></tr>
        <tr><td>p99</td><td>${ms(dur ? dur['p(99)'] : null)}</td></tr>
        <tr><td>max</td><td>${ms(dur ? dur.max : null)}</td></tr>
      </table>`}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orders Load Test Report</title>
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
    .slowest { margin: 16px 40px 0; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px 20px; font-size: 0.88rem; color: #856404; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; padding: 24px 40px; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden; border-top: 4px solid #adb5bd; }
    .card.passed { border-top-color: #28a745; }
    .card.failed { border-top-color: #dc3545; }
    .card.skipped { border-top-color: #adb5bd; opacity: 0.65; }
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px 6px; }
    .endpoint-label { font-weight: 600; font-size: 0.92rem; }
    .card-meta { padding: 0 20px 10px; font-size: 0.76rem; color: #777; }
    .card-meta code { background: #f0f2f5; padding: 1px 5px; border-radius: 3px; }
    .skip-note { padding: 10px 20px 16px; color: #999; font-size: 0.85rem; }
    .metrics-table { width: 100%; border-collapse: collapse; }
    .metrics-table th, .metrics-table td { padding: 7px 20px; font-size: 0.85rem; border-top: 1px solid #f0f2f5; text-align: left; }
    .metrics-table th { background: #f8f9fa; font-weight: 600; color: #555; }
    .badge { font-size: 0.76rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; }
    .badge.pass { background: #d4edda; color: #155724; }
    .badge.fail { background: #f8d7da; color: #721c24; }
    .badge.skip { background: #e2e3e5; color: #6c757d; }
    .good { color: #155724; font-weight: 600; }
    .bad  { color: #721c24; font-weight: 600; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 0.78rem; }
  </style>
</head>
<body>

  <div class="header">
    <h1>Orders Load Test Report</h1>
    <p>100 VUs &nbsp;·&nbsp; 8 min &nbsp;·&nbsp; ${runAt}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="label">Result</div>
      <div class="value">
        <span class="result-badge ${allPassed ? 'result-pass' : 'result-fail'}">
          ${allPassed ? '✅ PASSED' : '❌ FAILED'}
        </span>
      </div>
    </div>
    <div class="stat">
      <div class="label">Total Requests</div>
      <div class="value">${globalReqs ? Math.round(globalReqs.count || 0).toLocaleString() : '—'}</div>
    </div>
    <div class="stat">
      <div class="label">Error Rate</div>
      <div class="value ${globalFail && globalFail.rate > 0.01 ? 'bad' : 'good'}">${pct(globalFail ? globalFail.rate : null)}</div>
    </div>
    <div class="stat">
      <div class="label">p95 (global)</div>
      <div class="value ${globalDur && globalDur['p(95)'] > 500 ? 'bad' : 'good'}">${ms(globalDur ? globalDur['p(95)'] : null)}</div>
    </div>
    <div class="stat">
      <div class="label">avg (global)</div>
      <div class="value">${ms(globalDur ? globalDur.avg : null)}</div>
    </div>
  </div>

  ${slowestTag ? `
  <div class="slowest">
    ⚠️ <strong>Slowest endpoint by p95:</strong> <code>${slowestTag}</code> — ${ms(slowestP95)}
  </div>` : ''}

  <div class="cards-grid">
    ${cards}
  </div>

  <div class="footer">
    Generated by k6 &nbsp;·&nbsp; Circuly Orders Load Test &nbsp;·&nbsp; ${runAt}
  </div>

</body>
</html>`;
}
