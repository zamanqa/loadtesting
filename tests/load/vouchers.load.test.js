/**
 * Load test — Vouchers module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /vouchers                               (list)
 *   GET /vouchers/:voucher_code                  (by voucher code)
 *   GET /vouchers?page=1&per_page=100&sort=...  (filter)
 *   GET /vouchers?search=:voucher_code           (search)
 *
 * Run: npm run vouchers:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'vouchers.get_list',        p95: 1100, p90: 1000 },
  { tag: 'vouchers.get_by_code',     p95: 1100, p90: 1000 },
  { tag: 'vouchers.get_by_filter',   p95: 1100, p90: 1000 },
  { tag: 'vouchers.get_by_search',   p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('vouchers', ENDPOINTS),
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
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/vouchers?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch vouchers in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No vouchers found in the database — cannot run test without a valid voucherCode');
  }

  // Vouchers use voucher_code as the route parameter (not numeric id)
  const voucherCode = first.voucher_code || first.code || first.id;

  if (!voucherCode) {
    throw new Error(
      `Voucher code field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using voucherCode: ${voucherCode}`);

  return { voucherCode };
}

export default function ({ voucherCode }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'vouchers', ep: endpointTag },
    timeout: '10s',
  });

  // GET /vouchers — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/vouchers?page=1&per_page=100&sort=created_at&desc=true`,
    params('vouchers.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                      (r) => r.status === 200,
    'get_list: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['vouchers.get_list']}ms`]:         (r) => r.timings.duration < limit['vouchers.get_list'],
  }, { module: 'vouchers', ep: 'vouchers.get_list' });

  // GET /vouchers/:voucher_code
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (voucherCode) {
    const byCodeRes = k6.http.get(
      `${base}/vouchers/${voucherCode}`,
      params('vouchers.get_by_code')
    );
    k6.check(byCodeRes, {
      'get_by_code: status 200':                                       (r) => r.status === 200,
      'get_by_code: has voucher_code':                                 (r) => { try { const b = JSON.parse(r.body); return !!(b.voucher_code || b.code || b.id); } catch { return false; } },
      [`get_by_code: under ${limit['vouchers.get_by_code']}ms`]:       (r) => r.timings.duration < limit['vouchers.get_by_code'],
    }, { module: 'vouchers', ep: 'vouchers.get_by_code' });
  }

  // GET /vouchers — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/vouchers?page=1&per_page=100&sort=created_at&desc=true`,
    params('vouchers.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                     (r) => r.status === 200,
    'get_by_filter: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['vouchers.get_by_filter']}ms`]:   (r) => r.timings.duration < limit['vouchers.get_by_filter'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_filter' });

  // GET /vouchers?search=:voucherCode
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (voucherCode) {
    const searchRes = k6.http.get(
      `${base}/vouchers?search=${encodeURIComponent(voucherCode)}&sort=created_at&desc=true`,
      params('vouchers.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                     (r) => r.status === 200,
      'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['vouchers.get_by_search']}ms`]:   (r) => r.timings.duration < limit['vouchers.get_by_search'],
    }, { module: 'vouchers', ep: 'vouchers.get_by_search' });
  }
}

export function teardown({ voucherCode }) {
  console.log(`Vouchers load test complete. voucherCode used: ${voucherCode}`);
}

const REPORT_CONFIG = {
  title:    'Vouchers Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'vouchers',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'vouchers.get_list':      'GET /vouchers (list)',
      'vouchers.get_by_code':   'GET /vouchers/:voucher_code',
      'vouchers.get_by_filter': 'GET /vouchers (filter)',
      'vouchers.get_by_search': 'GET /vouchers?search=:voucher_code',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/vouchers-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
