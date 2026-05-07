// scenario: load — orders module, all GET endpoints (100 VUs, 8 min)
// endpoints: get_list, get_by_id, get_payment_update_link, get_payment_details, get_by_filter, get_by_search
import http from 'k6/http';
import { check, sleep } from 'k6';
import { getToken, setupAuth } from '../helpers/auth.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL    = __ENV.BASE_URL;
const API_VERSION = __ENV.API_VERSION || '2026-04';

// selector: per-endpoint threshold keys — must match tags.endpoint values below
export const options = {
  thresholds: {
    // selector: global thresholds — catch any endpoint regression
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],

    // selector: per-endpoint thresholds — list + filter + search must respond under 500ms
    'http_req_duration{endpoint:order.get_list}':                ['p(95)<500'],
    'http_req_duration{endpoint:order.get_by_id}':               ['p(95)<500'],
    'http_req_duration{endpoint:order.get_payment_update_link}': ['p(95)<800'],
    'http_req_duration{endpoint:order.get_payment_details}':     ['p(95)<800'],
    'http_req_duration{endpoint:order.get_by_filter}':           ['p(95)<500'],
    'http_req_duration{endpoint:order.get_by_search}':           ['p(95)<500'],
  },
  scenarios: {
    load: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '2m', target: 100 }, // ramp up to 100 VUs
        { duration: '5m', target: 100 }, // hold — normal expected traffic
        { duration: '1m', target: 0   }, // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

// action: validate credentials + resolve orderId once before VUs start
export function setup() {
  const { token, companyId } = setupAuth();

  // action: fetch one order to resolve a real orderId — avoids hardcoding IDs
  const ordersRes = http.get(
    `${BASE_URL}/${API_VERSION}/${companyId}/circulydb/orders?page=1&per_page=1`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  let orderId = null;
  if (ordersRes.status === 200) {
    const body = JSON.parse(ordersRes.body);
    orderId = (body.data && body.data.length > 0) ? body.data[0].order_id : null;
    orderId
      ? console.log(`[orders:load] orderId resolved: ${orderId}`)
      : console.error('[orders:load] Orders list empty — orderId-dependent endpoints will be skipped');
  } else {
    console.error(`[orders:load] Could not fetch orders: HTTP ${ordersRes.status}`);
  }

  return { orderId };
}

// action: run all 6 GET order requests per VU iteration
export default function (data) {
  const { orderId } = data;

  // action: getToken() returns cached token per VU — re-logins automatically when JWT expires
  const { token, companyId } = getToken();

  // action: shared headers + per-endpoint tag applied in params()
  const params = (endpoint) => ({
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    tags:    { scenario: 'load', endpoint },
    timeout: '10s',
  });

  const base = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb`;

  // --- GET /orders (paginated list) ---
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

  // --- GET /orders/{orderId} ---
  if (orderId) {
    const byIdRes = http.get(`${base}/orders/${orderId}`, params('order.get_by_id'));
    check(byIdRes, {
      'get_by_id: status 200':    (r) => r.status === 200,
      'get_by_id: has order_id':  (r) => !!JSON.parse(r.body).order_id,
      'get_by_id: under 500ms':   (r) => r.timings.duration < 500,
    });
  }
  sleep(1);

  // --- GET /orders/{orderId}/payment-update-link ---
  if (orderId) {
    const puRes = http.get(
      `${base}/orders/${orderId}/payment-update-link`,
      params('order.get_payment_update_link')
    );
    check(puRes, {
      'payment_update_link: status 200': (r) => r.status === 200,
      'payment_update_link: under 800ms':(r) => r.timings.duration < 800,
    });
  }
  sleep(1);

  // --- GET /orders/{orderId}/payment-details ---
  if (orderId) {
    const pdRes = http.get(
      `${base}/orders/${orderId}/payment-details`,
      params('order.get_payment_details')
    );
    check(pdRes, {
      'payment_details: status 200': (r) => r.status === 200,
      'payment_details: under 800ms':(r) => r.timings.duration < 800,
    });
  }
  sleep(1);

  // --- GET /orders (with explicit filter params) ---
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

  // --- GET /orders?search={orderId} ---
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

export function teardown(data) {
  console.log(`[orders:load] Run complete — orderId used: ${data.orderId}`);
}

// action: write human-readable HTML report — one card per endpoint
export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/orders-load-report.html': buildHtmlReport(data),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

// --- helpers ---

function ms(val) {
  return val != null ? `${Math.round(val)} ms` : '—';
}

function pct(val) {
  return val != null ? `${(val * 100).toFixed(1)}%` : '—';
}

function metricVals(data, key) {
  const m = data.metrics[key];
  return m ? m.values : null;
}

function thresholdOk(data, key) {
  const t = data.thresholds && data.thresholds[key];
  if (!t) return null;
  return t.ok !== false;
}

const ENDPOINTS = [
  { tag: 'order.get_list',                label: 'GET /orders (list)',                   p95limit: 500 },
  { tag: 'order.get_by_id',               label: 'GET /orders/{orderId}',                p95limit: 500 },
  { tag: 'order.get_payment_update_link', label: 'GET /orders/{orderId}/payment-update-link', p95limit: 800 },
  { tag: 'order.get_payment_details',     label: 'GET /orders/{orderId}/payment-details', p95limit: 800 },
  { tag: 'order.get_by_filter',           label: 'GET /orders (filter params)',           p95limit: 500 },
  { tag: 'order.get_by_search',           label: 'GET /orders?search={orderId}',          p95limit: 500 },
];

function buildHtmlReport(data) {
  const runAt    = new Date().toUTCString();
  const globalOk = thresholdOk(data, 'http_req_duration') !== false &&
                   thresholdOk(data, 'http_req_failed')   !== false;

  const globalDuration = metricVals(data, 'http_req_duration');
  const globalFailed   = metricVals(data, 'http_req_failed');
  const globalReqs     = metricVals(data, 'http_reqs');

  const cards = ENDPOINTS.map(({ tag, label, p95limit }) => {
    const dur     = metricVals(data, `http_req_duration{endpoint:${tag}}`);
    const failed  = metricVals(data, `http_req_failed{endpoint:${tag}}`);
    const reqs    = metricVals(data, `http_reqs{endpoint:${tag}}`);
    const tOk     = thresholdOk(data, `http_req_duration{endpoint:${tag}}`);
    const skipped = !dur;

    const p95Val  = dur ? dur['p(95)'] : null;
    const badge   = skipped
      ? `<span class="badge skip">SKIPPED</span>`
      : tOk === true
        ? `<span class="badge pass">✅ PASS</span>`
        : tOk === false
          ? `<span class="badge fail">❌ FAIL</span>`
          : `<span class="badge skip">NO DATA</span>`;

    const p95Class = p95Val != null
      ? (p95Val < p95limit ? 'good' : 'bad')
      : '';

    return `
    <div class="card ${skipped ? 'skipped' : (tOk === false ? 'failed' : 'passed')}">
      <div class="card-header">
        <span class="endpoint-label">${label}</span>
        ${badge}
      </div>
      <div class="card-tag">Tag: <code>${tag}</code> &nbsp;|&nbsp; p95 threshold: <code>${p95limit} ms</code></div>
      ${skipped ? '<p class="skip-note">Endpoint was not called (orderId unavailable or not reached).</p>' : `
      <table class="metrics-table">
        <tr>
          <th>Metric</th><th>Value</th>
        </tr>
        <tr><td>Requests (total)</td><td>${reqs ? Math.round(reqs.count || 0) : '—'}</td></tr>
        <tr><td>Error rate</td><td class="${failed && failed.rate > 0.01 ? 'bad' : 'good'}">${pct(failed ? failed.rate : null)}</td></tr>
        <tr><td>avg</td><td>${ms(dur ? dur.avg : null)}</td></tr>
        <tr><td>min</td><td>${ms(dur ? dur.min : null)}</td></tr>
        <tr><td>p50 (median)</td><td>${ms(dur ? dur.med : null)}</td></tr>
        <tr><td class="${p95Class}">p95</td><td class="${p95Class}">${ms(p95Val)}</td></tr>
        <tr><td>p99</td><td>${ms(dur ? dur['p(99)'] : null)}</td></tr>
        <tr><td>max</td><td>${ms(dur ? dur.max : null)}</td></tr>
      </table>`}
    </div>`;
  }).join('\n');

  // action: find slowest endpoint by p95 for the highlight banner
  let slowestTag = null, slowestP95 = 0;
  ENDPOINTS.forEach(({ tag }) => {
    const dur = metricVals(data, `http_req_duration{endpoint:${tag}}`);
    if (dur && dur['p(95)'] > slowestP95) {
      slowestP95 = dur['p(95)'];
      slowestTag = tag;
    }
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orders Load Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f5f7fa; color: #333; }
    .header { background: #1a2340; color: #fff; padding: 28px 40px; }
    .header h1 { margin: 0 0 6px; font-size: 1.6rem; }
    .header p  { margin: 0; opacity: 0.75; font-size: 0.9rem; }
    .summary { display: flex; gap: 20px; flex-wrap: wrap; padding: 24px 40px; background: #fff; border-bottom: 1px solid #e0e4eb; }
    .stat { flex: 1; min-width: 140px; background: #f5f7fa; border-radius: 8px; padding: 16px 20px; text-align: center; }
    .stat .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .stat .value { font-size: 1.5rem; font-weight: 700; }
    .overall-badge { font-size: 1.1rem; font-weight: 700; padding: 8px 22px; border-radius: 6px; display: inline-block; margin-bottom: 6px; }
    .overall-pass { background: #d4edda; color: #155724; }
    .overall-fail { background: #f8d7da; color: #721c24; }
    .slowest-banner { margin: 16px 40px 0; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px 20px; font-size: 0.9rem; }
    .slowest-banner strong { color: #856404; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 20px; padding: 24px 40px; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden; border-top: 4px solid #ccc; }
    .card.passed { border-top-color: #28a745; }
    .card.failed  { border-top-color: #dc3545; }
    .card.skipped { border-top-color: #6c757d; opacity: 0.7; }
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px 8px; }
    .endpoint-label { font-weight: 600; font-size: 0.95rem; word-break: break-all; }
    .card-tag { padding: 0 20px 10px; font-size: 0.78rem; color: #666; }
    .card-tag code { background: #f0f2f5; padding: 1px 5px; border-radius: 3px; }
    .skip-note { padding: 12px 20px 20px; color: #888; font-size: 0.88rem; }
    .metrics-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    .metrics-table th, .metrics-table td { padding: 7px 20px; text-align: left; font-size: 0.88rem; border-top: 1px solid #f0f2f5; }
    .metrics-table th { background: #f8f9fa; font-weight: 600; color: #555; }
    .badge { font-size: 0.78rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; }
    .badge.pass { background: #d4edda; color: #155724; }
    .badge.fail { background: #f8d7da; color: #721c24; }
    .badge.skip { background: #e2e3e5; color: #6c757d; }
    .good { color: #155724; font-weight: 600; }
    .bad  { color: #721c24; font-weight: 600; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Orders Load Test Report</h1>
    <p>Module: Orders API &nbsp;|&nbsp; Scenario: 100 VUs, 8 min &nbsp;|&nbsp; Run: ${runAt}</p>
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
      <div class="label">Total Requests</div>
      <div class="value">${globalReqs ? Math.round(globalReqs.count || 0).toLocaleString() : '—'}</div>
    </div>
    <div class="stat">
      <div class="label">Global Error Rate</div>
      <div class="value ${globalFailed && globalFailed.rate > 0.01 ? 'bad' : 'good'}">${pct(globalFailed ? globalFailed.rate : null)}</div>
    </div>
    <div class="stat">
      <div class="label">Global p95</div>
      <div class="value ${globalDuration && globalDuration['p(95)'] > 500 ? 'bad' : 'good'}">${ms(globalDuration ? globalDuration['p(95)'] : null)}</div>
    </div>
    <div class="stat">
      <div class="label">Global avg</div>
      <div class="value">${ms(globalDuration ? globalDuration.avg : null)}</div>
    </div>
  </div>

  ${slowestTag ? `
  <div class="slowest-banner">
    ⚠️ <strong>Slowest endpoint (p95):</strong> <code>${slowestTag}</code> — ${ms(slowestP95)}
    &nbsp; This endpoint took the longest under load. Investigate DB queries or server logic if it exceeds the threshold.
  </div>` : ''}

  <div class="cards-grid">
${cards}
  </div>

  <div class="footer">
    Generated by k6 handleSummary &nbsp;|&nbsp; Circuly Orders Load Test &nbsp;|&nbsp; ${runAt}
  </div>
</body>
</html>`;
}

