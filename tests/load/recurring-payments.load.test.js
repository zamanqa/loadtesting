/**
 * Load test — Recurring Payments module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /recurring-payments                              (list)
 *   GET /recurring-payments/:id                          (by ID)
 *   GET /recurring-payments?page=1&per_page=100&sort=... (filter)
 *   GET /recurring-payments?search=:subscription_id      (search by subscription ID)
 *
 * Run: npm run recurring-payments:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'recurring_payments.get_list',      p95: 1100, p90: 1000 },
  { tag: 'recurring_payments.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'recurring_payments.get_by_filter', p95: 1100, p90: 1000 },
  { tag: 'recurring_payments.get_by_search', p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('recurring_payments', ENDPOINTS),
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
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/recurring-payments?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch recurring payments in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No recurring payments found in the database — cannot run test without a valid recurringPaymentId');
  }

  const recurringPaymentId = first.id;
  // subscription_id is used for search — fall back to recurringPaymentId if missing
  const subscriptionId = first.subscription_id || String(recurringPaymentId);

  if (!recurringPaymentId) {
    throw new Error(
      `Recurring payment ID field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using recurringPaymentId: ${recurringPaymentId}, subscriptionId: ${subscriptionId}`);

  return { recurringPaymentId, subscriptionId };
}

export default function ({ recurringPaymentId, subscriptionId }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'recurring_payments', ep: endpointTag },
    timeout: '10s',
  });

  // GET /recurring-payments — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/recurring-payments?page=1&per_page=100&sort=created_at&desc=true`,
    params('recurring_payments.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                               (r) => r.status === 200,
    'get_list: has data':                                                 (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['recurring_payments.get_list']}ms`]:        (r) => r.timings.duration < limit['recurring_payments.get_list'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_list' });

  // GET /recurring-payments/:id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (recurringPaymentId) {
    const byIdRes = k6.http.get(
      `${base}/recurring-payments/${recurringPaymentId}`,
      params('recurring_payments.get_by_id')
    );
    k6.check(byIdRes, {
      'get_by_id: status 200':                                                (r) => r.status === 200,
      'get_by_id: has id':                                                    (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
      [`get_by_id: under ${limit['recurring_payments.get_by_id']}ms`]:        (r) => r.timings.duration < limit['recurring_payments.get_by_id'],
    }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_id' });
  }

  // GET /recurring-payments — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/recurring-payments?page=1&per_page=100&sort=created_at&desc=true`,
    params('recurring_payments.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                              (r) => r.status === 200,
    'get_by_filter: has data':                                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['recurring_payments.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['recurring_payments.get_by_filter'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_filter' });

  // GET /recurring-payments?search=:subscriptionId
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (subscriptionId) {
    const searchRes = k6.http.get(
      `${base}/recurring-payments?search=${subscriptionId}&sort=created_at&desc=true`,
      params('recurring_payments.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                              (r) => r.status === 200,
      'get_by_search: has data':                                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['recurring_payments.get_by_search']}ms`]:  (r) => r.timings.duration < limit['recurring_payments.get_by_search'],
    }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_search' });
  }
}

export function teardown({ recurringPaymentId }) {
  console.log(`Recurring payments load test complete. recurringPaymentId used: ${recurringPaymentId}`);
}

const REPORT_CONFIG = {
  title:    'Recurring Payments Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'recurring_payments',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'recurring_payments.get_list':      'GET /recurring-payments (list)',
      'recurring_payments.get_by_id':     'GET /recurring-payments/:id',
      'recurring_payments.get_by_filter': 'GET /recurring-payments (filter)',
      'recurring_payments.get_by_search': 'GET /recurring-payments?search=:subscription_id',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/recurring-payments-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
