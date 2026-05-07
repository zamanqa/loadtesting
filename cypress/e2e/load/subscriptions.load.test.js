/**
 * Load test — Subscriptions module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /subscriptions                              (list)
 *   GET /subscriptions/:id                          (by ID)
 *   GET /subscriptions?page=1&per_page=100&sort=... (filter)
 *   GET /subscriptions?search=:id                  (search)
 *
 * Threshold levels:
 *   1. Global  — applies to every request in the test
 *   2. Module  — http_req_duration{module:subscriptions} aggregates all 4 endpoints
 *   3. Endpoint — http_req_duration{ep:subscriptions.get_list} etc. per request type
 *
 * Run: npm run subscriptions:load
 */

import * as k6 from '../../support/helpers/k6.js';
import { getToken, setupAuth } from '../../support/helpers/auth.js';
import { buildHtmlReport } from '../../support/helpers/report.js';
import { buildThresholds } from '../../support/helpers/thresholds.js';

// Change this one constant to adjust the pause between all requests globally.
const SLEEP_BETWEEN_REQUESTS = 1; // seconds

// Endpoint definitions — used by the threshold builder, check labels, and report config.
// Change p95 here and both the threshold gate AND the check label update automatically.
// p90 is set explicitly to avoid the auto-derived (p95 × 0.80) being too aggressive.
const ENDPOINTS = [
  { tag: 'subscriptions.get_list',      p95: 1500, p90: 1400 },
  { tag: 'subscriptions.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'subscriptions.get_by_filter', p95: 1100, p90: 1000 },
  { tag: 'subscriptions.get_by_search', p95: 1100, p90: 1000 },
];

// Lookup map so check labels and conditions always match the p95 value above.
const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('subscriptions', ENDPOINTS),
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 5 }, // ramp up
        { duration: '5s',  target: 5 }, // hold at normal traffic
        { duration: '5s',  target: 0 }, // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

// Runs once before any VU starts.
// Validates credentials and picks up a real subscriptionId from the API so
// we don't have to hardcode anything in the test.
export function setup() {
  const { token, companyId } = setupAuth();

  const res = k6.http.get(
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/subscriptions?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch subscriptions in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const subscriptionId = body.data && body.data.length > 0 ? body.data[0].id : null;

  if (!subscriptionId) {
    throw new Error('No subscriptions found in the database — cannot run test without a valid subscriptionId');
  }

  console.log(`[setup] Using subscriptionId: ${subscriptionId}`);

  return { subscriptionId };
}

// Each VU runs this on every iteration.
// getToken() handles token caching and auto-refresh per VU.
export default function ({ subscriptionId }) {
  console.log(`[VU] Using subscriptionId: ${subscriptionId}`);

  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  // Both tags are required: 'module' enables the group-level threshold,
  // 'ep' enables the per-endpoint threshold.
  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'subscriptions', ep: endpointTag },
    timeout: '10s',
  });

  // GET /subscriptions — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/subscriptions?page=1&per_page=100&sort=created_at&desc=true`,
    params('subscriptions.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                      (r) => r.status === 200,
    'get_list: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['subscriptions.get_list']}ms`]:    (r) => r.timings.duration < limit['subscriptions.get_list'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_list' });

  // GET /subscriptions/:id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (subscriptionId) {
    const byIdRes = k6.http.get(
      `${base}/subscriptions/${subscriptionId}`,
      params('subscriptions.get_by_id')
    );
    k6.check(byIdRes, {
      'get_by_id: status 200':                                        (r) => r.status === 200,
      'get_by_id: has id':                               (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
      [`get_by_id: under ${limit['subscriptions.get_by_id']}ms`]:     (r) => r.timings.duration < limit['subscriptions.get_by_id'],
    }, { module: 'subscriptions', ep: 'subscriptions.get_by_id' });
  }

  // GET /subscriptions — with explicit filter params
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/subscriptions?page=1&per_page=100&sort=created_at&desc=true`,
    params('subscriptions.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                      (r) => r.status === 200,
    'get_by_filter: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['subscriptions.get_by_filter']}ms`]: (r) => r.timings.duration < limit['subscriptions.get_by_filter'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_filter' });

  // GET /subscriptions?search=:subscriptionId
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (subscriptionId) {
    const searchRes = k6.http.get(
      `${base}/subscriptions?search=${subscriptionId}&sort=created_at&desc=true`,
      params('subscriptions.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                      (r) => r.status === 200,
      'get_by_search: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['subscriptions.get_by_search']}ms`]: (r) => r.timings.duration < limit['subscriptions.get_by_search'],
    }, { module: 'subscriptions', ep: 'subscriptions.get_by_search' });
  }
}

export function teardown({ subscriptionId }) {
  console.log(`Subscriptions load test complete. subscriptionId used: ${subscriptionId}`);
}

// p95limit in REPORT_CONFIG is derived from ENDPOINTS so the report always
// reflects the same value as the threshold and check label.
const REPORT_CONFIG = {
  title:    'Subscriptions Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'subscriptions',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'subscriptions.get_list':      'GET /subscriptions (list)',
      'subscriptions.get_by_id':     'GET /subscriptions/:id',
      'subscriptions.get_by_filter': 'GET /subscriptions (filter)',
      'subscriptions.get_by_search': 'GET /subscriptions?search=:id',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/subscriptions-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
