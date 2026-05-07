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
import { buildHtmlReport } from '../../support/helpers/report.js';

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

const REPORT_CONFIG = {
  title: 'Orders Load Test Report',
  subtitle: '100 VUs · 8 min',
  endpoints: [
    { tag: 'order.get_list',                label: 'GET /orders (list)',                   p95limit: 500 },
    { tag: 'order.get_by_id',               label: 'GET /orders/:id',                      p95limit: 500 },
    { tag: 'order.get_payment_update_link', label: 'GET /orders/:id/payment-update-link',  p95limit: 800 },
    { tag: 'order.get_payment_details',     label: 'GET /orders/:id/payment-details',      p95limit: 800 },
    { tag: 'order.get_by_filter',           label: 'GET /orders (filter)',                 p95limit: 500 },
    { tag: 'order.get_by_search',           label: 'GET /orders?search=:id',               p95limit: 500 },
  ],
};

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/orders-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
