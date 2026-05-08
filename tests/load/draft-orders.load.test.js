/**
 * Load test — Draft Orders module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /draft-orders                              (list)
 *   GET /draft-orders/:id                          (by ID)
 *   GET /draft-orders?page=1&per_page=100&sort=... (filter)
 *   GET /draft-orders?search=:name                 (search by draft order name)
 *
 * Run: npm run draft-orders:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'draft_orders.get_list',      p95: 1100, p90: 1000 },
  { tag: 'draft_orders.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'draft_orders.get_by_filter', p95: 1100, p90: 1000 },
  { tag: 'draft_orders.get_by_search', p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('draft_orders', ENDPOINTS),
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 }, // ramp up
        { duration: '5s', target: 5 }, // hold
        { duration: '5s', target: 0 }, // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

export function setup() {
  const { token, companyId } = setupAuth();

  const res = k6.http.get(
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/draft-orders?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch draft orders in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No draft orders found in the database — cannot run test without a valid draftOrderId');
  }

  const draftOrderId = first.id;
  // name is used for search — fall back to id if name is not present
  const draftOrderName = first.name || first.title || String(draftOrderId);

  if (!draftOrderId) {
    throw new Error(
      `Draft order ID field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using draftOrderId: ${draftOrderId}, draftOrderName: ${draftOrderName}`);

  return { draftOrderId, draftOrderName };
}

export default function ({ draftOrderId, draftOrderName }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'draft_orders', ep: endpointTag },
    timeout: '10s',
  });

  // GET /draft-orders — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/draft-orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('draft_orders.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                          (r) => r.status === 200,
    'get_list: has data':                                            (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['draft_orders.get_list']}ms`]:         (r) => r.timings.duration < limit['draft_orders.get_list'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_list' });

  // GET /draft-orders/:id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (draftOrderId) {
    const byIdRes = k6.http.get(
      `${base}/draft-orders/${draftOrderId}`,
      params('draft_orders.get_by_id')
    );
    k6.check(byIdRes, {
      'get_by_id: status 200':                                           (r) => r.status === 200,
      'get_by_id: has id':                                               (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
      [`get_by_id: under ${limit['draft_orders.get_by_id']}ms`]:         (r) => r.timings.duration < limit['draft_orders.get_by_id'],
    }, { module: 'draft_orders', ep: 'draft_orders.get_by_id' });
  }

  // GET /draft-orders — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/draft-orders?page=1&per_page=100&sort=created_at&desc=true`,
    params('draft_orders.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                         (r) => r.status === 200,
    'get_by_filter: has data':                                           (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['draft_orders.get_by_filter']}ms`]:   (r) => r.timings.duration < limit['draft_orders.get_by_filter'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_filter' });

  // GET /draft-orders?search=:name
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (draftOrderName) {
    const searchRes = k6.http.get(
      `${base}/draft-orders?search=${encodeURIComponent(draftOrderName)}&sort=created_at&desc=true`,
      params('draft_orders.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                         (r) => r.status === 200,
      'get_by_search: has data':                                           (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['draft_orders.get_by_search']}ms`]:   (r) => r.timings.duration < limit['draft_orders.get_by_search'],
    }, { module: 'draft_orders', ep: 'draft_orders.get_by_search' });
  }
}

export function teardown({ draftOrderId }) {
  console.log(`Draft orders load test complete. draftOrderId used: ${draftOrderId}`);
}

const REPORT_CONFIG = {
  title:    'Draft Orders Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'draft_orders',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'draft_orders.get_list':      'GET /draft-orders (list)',
      'draft_orders.get_by_id':     'GET /draft-orders/:id',
      'draft_orders.get_by_filter': 'GET /draft-orders (filter)',
      'draft_orders.get_by_search': 'GET /draft-orders?search=:name',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/draft-orders-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
