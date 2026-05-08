/**
 * Load test — Customers module (all GET endpoints)
 *
 * Covers 5 endpoints:
 *   GET /customers                              (list)
 *   GET /customers/:uid                         (by ID)
 *   GET /customers/:uid/balance                 (balance)
 *   GET /customers?page=1&per_page=100&sort=... (filter)
 *   GET /customers?search=:uid                  (search)
 *
 * Run: npm run customers:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'customers.get_list',         p95: 1100, p90: 1000 },
  { tag: 'customers.get_by_id',        p95: 1100, p90: 1000 },
  { tag: 'customers.get_balance',      p95: 1100, p90: 1000 },
  { tag: 'customers.get_by_filter',    p95: 1100, p90: 1000 },
  { tag: 'customers.get_by_search',    p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  cloud: k6.cloudConfig('Customers Load'),
  thresholds: buildThresholds('customers', ENDPOINTS),
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },
        { duration: '5s', target: 5 },
        { duration: '5s', target: 0 },
      ],
      tags: { scenario: 'load' },
    },
  },
};

export function setup() {
  const { token, companyId } = setupAuth();

  const res = k6.http.get(
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/customers?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch customers in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No customers found in the database — cannot run test without a valid customerId');
  }

  const customerId = first.uid || first.id;

  if (!customerId) {
    throw new Error(
      `Customer ID field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using customerId: ${customerId}`);

  return { customerId };
}

export default function ({ customerId }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'customers', ep: endpointTag },
    timeout: '10s',
  });

  // GET /customers — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/customers?page=1&per_page=100&sort=created_at&desc=true`,
    params('customers.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                   (r) => r.status === 200,
    'get_list: has data':                                     (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['customers.get_list']}ms`]:     (r) => r.timings.duration < limit['customers.get_list'],
  }, { module: 'customers', ep: 'customers.get_list' });

  // GET /customers/:uid
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const byIdRes = k6.http.get(`${base}/customers/${customerId}`, params('customers.get_by_id'));
  k6.check(byIdRes, {
    'get_by_id: status 200':                                  (r) => r.status === 200,
    'get_by_id: has id':                                      (r) => { try { const b = JSON.parse(r.body); return !!(b.uid || b.id); } catch { return false; } },
    [`get_by_id: under ${limit['customers.get_by_id']}ms`]:   (r) => r.timings.duration < limit['customers.get_by_id'],
  }, { module: 'customers', ep: 'customers.get_by_id' });

  // GET /customers/:uid/balance
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const balanceRes = k6.http.get(`${base}/customers/${customerId}/balance`, params('customers.get_balance'));
  k6.check(balanceRes, {
    'get_balance: status 200':                                (r) => r.status === 200,
    'get_balance: has remaining_amount':                      (r) => { try { return 'remaining_amount' in JSON.parse(r.body); } catch { return false; } },
    [`get_balance: under ${limit['customers.get_balance']}ms`]: (r) => r.timings.duration < limit['customers.get_balance'],
  }, { module: 'customers', ep: 'customers.get_balance' });

  // GET /customers — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/customers?page=1&per_page=100&sort=created_at&desc=true`,
    params('customers.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                              (r) => r.status === 200,
    'get_by_filter: has data':                               (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['customers.get_by_filter']}ms`]: (r) => r.timings.duration < limit['customers.get_by_filter'],
  }, { module: 'customers', ep: 'customers.get_by_filter' });

  // GET /customers?search=:uid
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const searchRes = k6.http.get(
    `${base}/customers?search=${customerId}&sort=created_at&desc=true`,
    params('customers.get_by_search')
  );
  k6.check(searchRes, {
    'get_by_search: status 200':                              (r) => r.status === 200,
    'get_by_search: has data':                               (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['customers.get_by_search']}ms`]: (r) => r.timings.duration < limit['customers.get_by_search'],
  }, { module: 'customers', ep: 'customers.get_by_search' });
}

export function teardown({ customerId }) {
  console.log(`Customers load test complete. customerId used: ${customerId}`);
}

const REPORT_CONFIG = {
  title:    'Customers Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'customers',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'customers.get_list':      'GET /customers (list)',
      'customers.get_by_id':     'GET /customers/:uid',
      'customers.get_balance':   'GET /customers/:uid/balance',
      'customers.get_by_filter': 'GET /customers (filter)',
      'customers.get_by_search': 'GET /customers?search=:uid',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/customers-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
