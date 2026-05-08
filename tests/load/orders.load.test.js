/**
 * Load test — Orders module (all GET endpoints)
 *
 * Covers 6 endpoints:
 *   GET /orders                              (list)
 *   GET /orders/:id                          (by ID)
 *   GET /orders/:id/payment-update-link
 *   GET /orders/:id/payment-methods
 *   GET /orders?page=1&per_page=100&sort=... (filter)
 *   GET /orders?search=:id                  (search)
 *
 * Threshold levels:
 *   1. Global  — applies to every request in the test
 *   2. Module  — http_req_duration{module:orders} aggregates all 6 endpoints
 *   3. Endpoint — http_req_duration{ep:orders.get_list} etc. per request type
 *
 * Run: npm run orders:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

// Change this one constant to adjust the pause between all requests globally.
const SLEEP_BETWEEN_REQUESTS = 1; // seconds

// Endpoint definitions — used by the threshold builder, check labels, and report config.
// Change p95 here and both the threshold gate AND the check label update automatically.
// p90 is set explicitly because auto-derived (p95 × 0.80) is too tight for these endpoints —
// measured p90 runs at ~840–960ms. p95 is 1100ms to give headroom above measured ~880–1000ms.
const ENDPOINTS = [
  { tag: 'orders.get_list',                p95: 1100, p90: 1000 },
  { tag: 'orders.get_by_id',               p95: 1100, p90: 1000 },
  { tag: 'orders.get_payment_update_link', p95: 1100, p90: 1000 },
  { tag: 'orders.get_payment_methods',     p95: 1100, p90: 1000 },
  { tag: 'orders.get_by_filter',           p95: 1100, p90: 1000 },
  { tag: 'orders.get_by_search',           p95: 1100, p90: 1000 },
];

// Lookup map so check labels and conditions always match the p95 value above.
const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('orders', ENDPOINTS),
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 }, // ramp up
        { duration: '5s', target: 5 }, // hold at normal traffic
        { duration: '5s', target: 0 },   // ramp down
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

  if (!token)     throw new Error('[setup] Login failed — check CONSUMER_KEY / CONSUMER_SECRET in .env');
  if (!companyId) throw new Error('[setup] companyId is null — check COMPANY_ID in .env (or verify the login response includes company_id)');

  const res = k6.http.get(
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/orders?page=1&per_page=1`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch orders in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body    = JSON.parse(res.body);
  const orderId = body.data && body.data.length > 0 ? body.data[0].id : null;

  if (!orderId) {
    throw new Error('No orders found in the database — cannot run test without a valid orderId');
  }

  console.log(`[setup] orderId: ${orderId}`);

  return { orderId };
}

// Each VU runs this on every iteration.
// getToken() handles token caching and auto-refresh per VU.
export default function ({ orderId }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}`;

  // Both tags are required: 'module' enables the group-level threshold,
  // 'ep' enables the per-endpoint threshold.
  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'orders', ep: endpointTag },
    timeout: '10s',
  });

  // GET /orders — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('orders.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                              (r) => r.status === 200,
    'get_list: has data':                               (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['orders.get_list']}ms`]:  (r) => r.timings.duration < limit['orders.get_list'],
  }, { module: 'orders', ep: 'orders.get_list' });

  // GET /orders/:id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const byIdRes = k6.http.get(`${base}/orders/${orderId}`, params('orders.get_by_id'));
    k6.check(byIdRes, {
      'get_by_id: status 200':                               (r) => r.status === 200,
      'get_by_id: has id':                                   (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
      [`get_by_id: under ${limit['orders.get_by_id']}ms`]:   (r) => r.timings.duration < limit['orders.get_by_id'],
    }, { module: 'orders', ep: 'orders.get_by_id' });
  }

  // GET /orders/:id/payment-update-link
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const linkRes = k6.http.get(
      `${base}/orders/${orderId}/payment-update-link`,
      params('orders.get_payment_update_link')
    );
    k6.check(linkRes, {
      'payment_update_link: status 200':                                           (r) => r.status === 200,
      [`payment_update_link: under ${limit['orders.get_payment_update_link']}ms`]: (r) => r.timings.duration < limit['orders.get_payment_update_link'],
    }, { module: 'orders', ep: 'orders.get_payment_update_link' });
  }

  // GET /orders/:id/payment-methods
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const detailsRes = k6.http.get(
      `${base}/orders/${orderId}/payment-methods`,
      params('orders.get_payment_methods')
    );
    k6.check(detailsRes, {
      'payment_methods: status 200':                                       (r) => r.status === 200,
      [`payment_methods: under ${limit['orders.get_payment_methods']}ms`]: (r) => r.timings.duration < limit['orders.get_payment_methods'],
    }, { module: 'orders', ep: 'orders.get_payment_methods' });
  }

  // GET /orders — with explicit filter params
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('orders.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                  (r) => r.status === 200,
    'get_by_filter: has data':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['orders.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['orders.get_by_filter'],
  }, { module: 'orders', ep: 'orders.get_by_filter' });

  // GET /orders?search=:orderId
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (orderId) {
    const searchRes = k6.http.get(
      `${base}/orders?search=${orderId}&sort=created_at&desc=true`,
      params('orders.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                  (r) => r.status === 200,
      'get_by_search: has data':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['orders.get_by_search']}ms`]:  (r) => r.timings.duration < limit['orders.get_by_search'],
    }, { module: 'orders', ep: 'orders.get_by_search' });
  }
}

export function teardown({ orderId }) {
  console.log(`Orders load test complete. orderId used: ${orderId}`);
}

// p95limit in REPORT_CONFIG is derived from ENDPOINTS so the report always
// reflects the same value as the threshold and check label.
const REPORT_CONFIG = {
  title:    'Orders Load Test Report',
  subtitle: '100 VUs · 8 min',
  module:   'orders',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label:    {
      'orders.get_list':                'GET /orders (list)',
      'orders.get_by_id':               'GET /orders/:id',
      'orders.get_payment_update_link': 'GET /orders/:id/payment-update-link',
      'orders.get_payment_methods':     'GET /orders/:id/payment-methods',
      'orders.get_by_filter':           'GET /orders (filter)',
      'orders.get_by_search':           'GET /orders?search=:id',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/orders-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
