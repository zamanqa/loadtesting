/**
 * Load test — Invoices module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /paginated-invoices                              (list)
 *   GET /invoices/:invoice_number                        (by invoice number)
 *   GET /paginated-invoices?page=1&per_page=100&sort=... (filter)
 *   GET /paginated-invoices?search=:invoice_number       (search)
 *
 * Note: list / filter / search all use /paginated-invoices.
 *       The single-record endpoint uses /invoices/:invoice_number.
 *
 * Run: npm run invoices:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'invoices.get_list',        p95: 1500, p90: 1400 },
  { tag: 'invoices.get_by_number',   p95: 1100, p90: 1000 },
  { tag: 'invoices.get_by_filter',   p95: 1500, p90: 1400 },
  { tag: 'invoices.get_by_search',   p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('invoices', ENDPOINTS),
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
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/paginated-invoices?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch invoices in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No invoices found in the database — cannot run test without a valid invoice_number');
  }

  const invoiceNumber = first.invoice_number || first.number || first.id;

  if (!invoiceNumber) {
    throw new Error(
      `Invoice number field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using invoiceNumber: ${invoiceNumber}`);

  return { invoiceNumber };
}

export default function ({ invoiceNumber }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'invoices', ep: endpointTag },
    timeout: '10s',
  });

  // GET /paginated-invoices — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/paginated-invoices?page=1&per_page=100&sort=created_at&desc=true`,
    params('invoices.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                    (r) => r.status === 200,
    'get_list: has data':                                      (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['invoices.get_list']}ms`]:       (r) => r.timings.duration < limit['invoices.get_list'],
  }, { module: 'invoices', ep: 'invoices.get_list' });

  // GET /invoices/:invoice_number
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (invoiceNumber) {
    const byNumberRes = k6.http.get(
      `${base}/invoices/${invoiceNumber}`,
      params('invoices.get_by_number')
    );
    k6.check(byNumberRes, {
      'get_by_number: status 200':                                     (r) => r.status === 200,
      'get_by_number: has invoice_number':                             (r) => { try { const b = JSON.parse(r.body); return !!(b.invoice_number || b.number || b.id); } catch { return false; } },
      [`get_by_number: under ${limit['invoices.get_by_number']}ms`]:   (r) => r.timings.duration < limit['invoices.get_by_number'],
    }, { module: 'invoices', ep: 'invoices.get_by_number' });
  }

  // GET /paginated-invoices — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/paginated-invoices?page=1&per_page=100&sort=created_at&desc=true`,
    params('invoices.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                       (r) => r.status === 200,
    'get_by_filter: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['invoices.get_by_filter']}ms`]:     (r) => r.timings.duration < limit['invoices.get_by_filter'],
  }, { module: 'invoices', ep: 'invoices.get_by_filter' });

  // GET /paginated-invoices?search=:invoiceNumber
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (invoiceNumber) {
    const searchRes = k6.http.get(
      `${base}/paginated-invoices?search=${invoiceNumber}&sort=created_at&desc=true`,
      params('invoices.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                     (r) => r.status === 200,
      'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['invoices.get_by_search']}ms`]:   (r) => r.timings.duration < limit['invoices.get_by_search'],
    }, { module: 'invoices', ep: 'invoices.get_by_search' });
  }
}

export function teardown({ invoiceNumber }) {
  console.log(`Invoices load test complete. invoiceNumber used: ${invoiceNumber}`);
}

const REPORT_CONFIG = {
  title:    'Invoices Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'invoices',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'invoices.get_list':      'GET /paginated-invoices (list)',
      'invoices.get_by_number': 'GET /invoices/:invoice_number',
      'invoices.get_by_filter': 'GET /paginated-invoices (filter)',
      'invoices.get_by_search': 'GET /paginated-invoices?search=:invoice_number',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/invoices-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
