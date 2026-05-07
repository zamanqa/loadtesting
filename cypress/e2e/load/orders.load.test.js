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
 * Threshold levels:
 *   1. Global  — applies to every request in the test
 *   2. Module  — http_req_duration{module:orders} aggregates all 6 endpoints
 *   3. Endpoint — http_req_duration{endpoint:orders.get_list} etc. per request type
 *
 * Run: npm run orders:load
 */

import { http, check, sleep, textSummary, BASE_URL, API_VERSION } from '../../support/helpers/k6.js';
import { getToken, setupAuth } from '../../support/helpers/auth.js';
import { buildHtmlReport } from '../../support/helpers/report.js';
import { buildThresholds } from '../../support/helpers/thresholds.js';

// Change this one constant to adjust the pause between all requests globally.
const SLEEP_BETWEEN_REQUESTS = 1; // seconds

// Endpoint definitions — used by both the threshold builder and the report config.
// p99 is omitted here so it defaults to p95 × 2 inside buildThresholds.
const ENDPOINTS = [
  { tag: 'orders.get_list',                p95: 500 },
  { tag: 'orders.get_by_id',               p95: 500 },
  { tag: 'orders.get_payment_update_link', p95: 800 },
  { tag: 'orders.get_payment_details',     p95: 800 },
  { tag: 'orders.get_by_filter',           p95: 500 },
  { tag: 'orders.get_by_search',           p95: 500 },
];

export const options = {
  thresholds: buildThresholds('orders', ENDPOINTS),
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

  // Both tags are required: 'module' enables the group-level threshold,
  // 'endpoint' enables the per-endpoint threshold.
  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'orders', endpoint: endpointTag },
    timeout: '10s',
  });

  // GET /orders — paginated list
  sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('orders.get_list')
  );
  check(listRes, {
    'get_list: status 200':  (r) => r.status === 200,
    'get_list: has data':    (r) => Array.isArray(JSON.parse(r.body).data),
    'get_list: under 500ms': (r) => r.timings.duration < 500,
  });

  // GET /orders/:id
  sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const byIdRes = http.get(`${base}/orders/${orderId}`, params('orders.get_by_id'));
    check(byIdRes, {
      'get_by_id: status 200':   (r) => r.status === 200,
      'get_by_id: has order_id': (r) => !!JSON.parse(r.body).order_id,
      'get_by_id: under 500ms':  (r) => r.timings.duration < 500,
    });
  }

  // GET /orders/:id/payment-update-link
  sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const linkRes = http.get(
      `${base}/orders/${orderId}/payment-update-link`,
      params('orders.get_payment_update_link')
    );
    check(linkRes, {
      'payment_update_link: status 200':  (r) => r.status === 200,
      'payment_update_link: under 800ms': (r) => r.timings.duration < 800,
    });
  }

  // GET /orders/:id/payment-details
  sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const detailsRes = http.get(
      `${base}/orders/${orderId}/payment-details`,
      params('orders.get_payment_details')
    );
    check(detailsRes, {
      'payment_details: status 200':  (r) => r.status === 200,
      'payment_details: under 800ms': (r) => r.timings.duration < 800,
    });
  }

  // GET /orders — with explicit filter params
  sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('orders.get_by_filter')
  );
  check(filterRes, {
    'get_by_filter: status 200':  (r) => r.status === 200,
    'get_by_filter: has data':    (r) => Array.isArray(JSON.parse(r.body).data),
    'get_by_filter: under 500ms': (r) => r.timings.duration < 500,
  });

  // GET /orders?search=:orderId
  sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const searchRes = http.get(
      `${base}/orders?search=${orderId}&sort=created_at&desc=true`,
      params('orders.get_by_search')
    );
    check(searchRes, {
      'get_by_search: status 200':  (r) => r.status === 200,
      'get_by_search: has data':    (r) => Array.isArray(JSON.parse(r.body).data),
      'get_by_search: under 500ms': (r) => r.timings.duration < 500,
    });
  }
}

export function teardown({ orderId }) {
  console.log(`Orders load test complete. orderId used: ${orderId}`);
}

const REPORT_CONFIG = {
  title:    'Orders Load Test Report',
  subtitle: '100 VUs · 8 min',
  module:   'orders',
  endpoints: [
    { tag: 'orders.get_list',                label: 'GET /orders (list)',                   p95limit: 500 },
    { tag: 'orders.get_by_id',               label: 'GET /orders/:id',                      p95limit: 500 },
    { tag: 'orders.get_payment_update_link', label: 'GET /orders/:id/payment-update-link',  p95limit: 800 },
    { tag: 'orders.get_payment_details',     label: 'GET /orders/:id/payment-details',      p95limit: 800 },
    { tag: 'orders.get_by_filter',           label: 'GET /orders (filter)',                 p95limit: 500 },
    { tag: 'orders.get_by_search',           label: 'GET /orders?search=:id',               p95limit: 500 },
  ],
};

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/orders-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
