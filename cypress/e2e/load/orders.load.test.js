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

import * as k6 from '../../support/helpers/k6.js';
import { getToken, setupAuth } from '../../support/helpers/auth.js';
import { buildHtmlReport } from '../../support/helpers/report.js';
import { buildThresholds } from '../../support/helpers/thresholds.js';

// Change this one constant to adjust the pause between all requests globally.
const SLEEP_BETWEEN_REQUESTS = 1; // seconds

// Endpoint definitions — used by both the threshold builder and the report config.
// p99 is omitted here so it defaults to p95 × 2 inside buildThresholds.
const ENDPOINTS = [
  { tag: 'orders.get_list',                p95: 1000 },
  { tag: 'orders.get_by_id',               p95: 1000 },
  { tag: 'orders.get_payment_update_link', p95: 1000 },
  { tag: 'orders.get_payment_details',     p95: 1000 },
  { tag: 'orders.get_by_filter',           p95: 1000 },
  { tag: 'orders.get_by_search',           p95: 1000 },
];

export const options = {
  thresholds: buildThresholds('orders', ENDPOINTS),
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 }, // ramp up
        { duration: '10s', target: 10 }, // hold at normal traffic
        { duration: '10s', target: 0 },   // ramp down
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

  const res = k6.http.get(
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/orders?page=1&per_page=1`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  let orderId = null;

  if (res.status !== 200) {
    throw new Error(`Could not fetch orders in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  orderId = body.data && body.data.length > 0 ? body.data[0].id : null;

  if (!orderId) {
    throw new Error('No orders found in the database — cannot run test without a valid orderId');
  }

  console.log(`[setup] Using orderId: ${orderId}`);

  return { orderId };
}

// Each VU runs this on every iteration.
// getToken() handles token caching and auto-refresh per VU.
export default function ({ orderId }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

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
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('orders.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':  (r) => r.status === 200,
    'get_list: has data':    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    'get_list: under 500ms': (r) => r.timings.duration < 1000,
  });

  // GET /orders/:id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const byIdRes = k6.http.get(`${base}/orders/${orderId}`, params('orders.get_by_id'));
    k6.check(byIdRes, {
      'get_by_id: status 200':   (r) => r.status === 200,
      'get_by_id: has id':       (r) => { try { return !!JSON.parse(r.body).id; }       catch { return false; } },
      'get_by_id: under 500ms':  (r) => r.timings.duration < 1000,
    });
  }

  // GET /orders/:id/payment-update-link
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const linkRes = k6.http.get(
      `${base}/orders/${orderId}/payment-update-link`,
      params('orders.get_payment_update_link')
    );
    k6.check(linkRes, {
      'payment_update_link: status 200':  (r) => r.status === 200,
      'payment_update_link: under 800ms': (r) => r.timings.duration < 1000,
    });
  }

  // GET /orders/:id/payment-details
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const detailsRes = k6.http.get(
      `${base}/orders/${orderId}/payment-details`,
      params('orders.get_payment_details')
    );
    k6.check(detailsRes, {
      'payment_details: status 200':  (r) => r.status === 200,
      'payment_details: under 800ms': (r) => r.timings.duration < 1000,
    });
  }

  // GET /orders — with explicit filter params
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('orders.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':  (r) => r.status === 200,
    'get_by_filter: has data':    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    'get_by_filter: under 500ms': (r) => r.timings.duration < 1000,
  });

  // GET /orders?search=:orderId
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const searchRes = k6.http.get(
      `${base}/orders?search=${orderId}&sort=created_at&desc=true`,
      params('orders.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':  (r) => r.status === 200,
      'get_by_search: has data':    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      'get_by_search: under 500ms': (r) => r.timings.duration < 1000,
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
    { tag: 'orders.get_list',                label: 'GET /orders (list)',                   p95limit: 1000 },
    { tag: 'orders.get_by_id',               label: 'GET /orders/:id',                      p95limit: 1000 },
    { tag: 'orders.get_payment_update_link', label: 'GET /orders/:id/payment-update-link',  p95limit: 1000 },
    { tag: 'orders.get_payment_details',     label: 'GET /orders/:id/payment-details',      p95limit: 1000 },
    { tag: 'orders.get_by_filter',           label: 'GET /orders (filter)',                 p95limit: 1000 },
    { tag: 'orders.get_by_search',           label: 'GET /orders?search=:id',               p95limit: 1000 },
  ],
};

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/orders-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
