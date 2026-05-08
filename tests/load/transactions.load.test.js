/**
 * Load test — Transactions module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /transactions                              (list)
 *   GET /transactions/:id                          (by ID)
 *   GET /transactions?page=1&per_page=100&sort=... (filter)
 *   GET /transactions?search=:id                   (search)
 *
 * Run: npm run transactions:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'transactions.get_list',      p95: 1100, p90: 1000 },
  { tag: 'transactions.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'transactions.get_by_filter', p95: 1100, p90: 1000 },
  { tag: 'transactions.get_by_search', p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('transactions', ENDPOINTS),
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
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/transactions?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch transactions in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No transactions found in the database — cannot run test without a valid transactionId');
  }

  const transactionId = first.id || first.transaction_id;

  if (!transactionId) {
    throw new Error(
      `Transaction ID field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using transactionId: ${transactionId}`);

  return { transactionId };
}

export default function ({ transactionId }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'transactions', ep: endpointTag },
    timeout: '10s',
  });

  // GET /transactions — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/transactions?page=1&per_page=100&sort=created_at&desc=true`,
    params('transactions.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                        (r) => r.status === 200,
    'get_list: has data':                                          (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['transactions.get_list']}ms`]:       (r) => r.timings.duration < limit['transactions.get_list'],
  }, { module: 'transactions', ep: 'transactions.get_list' });

  // GET /transactions/:id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (transactionId) {
    const byIdRes = k6.http.get(
      `${base}/transactions/${transactionId}`,
      params('transactions.get_by_id')
    );
    k6.check(byIdRes, {
      'get_by_id: status 200':                                         (r) => r.status === 200,
      'get_by_id: has id':                                             (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
      [`get_by_id: under ${limit['transactions.get_by_id']}ms`]:       (r) => r.timings.duration < limit['transactions.get_by_id'],
    }, { module: 'transactions', ep: 'transactions.get_by_id' });
  }

  // GET /transactions — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/transactions?page=1&per_page=100&sort=created_at&desc=true`,
    params('transactions.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                       (r) => r.status === 200,
    'get_by_filter: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['transactions.get_by_filter']}ms`]: (r) => r.timings.duration < limit['transactions.get_by_filter'],
  }, { module: 'transactions', ep: 'transactions.get_by_filter' });

  // GET /transactions?search=:transactionId
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (transactionId) {
    const searchRes = k6.http.get(
      `${base}/transactions?search=${transactionId}&sort=created_at&desc=true`,
      params('transactions.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                       (r) => r.status === 200,
      'get_by_search: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['transactions.get_by_search']}ms`]: (r) => r.timings.duration < limit['transactions.get_by_search'],
    }, { module: 'transactions', ep: 'transactions.get_by_search' });
  }
}

export function teardown({ transactionId }) {
  console.log(`Transactions load test complete. transactionId used: ${transactionId}`);
}

const REPORT_CONFIG = {
  title:    'Transactions Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'transactions',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'transactions.get_list':      'GET /transactions (list)',
      'transactions.get_by_id':     'GET /transactions/:id',
      'transactions.get_by_filter': 'GET /transactions (filter)',
      'transactions.get_by_search': 'GET /transactions?search=:id',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/transactions-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
