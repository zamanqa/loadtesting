/**
 * Load test — Retailers module (all GET endpoints)
 *
 * Covers 4 endpoints:
 *   GET /retailers                               (list)
 *   GET /retailers/:location_id                  (by location_id — NOT numeric id)
 *   GET /retailers?page=1&per_page=100&sort=...  (filter)
 *   GET /retailers?search=:name                  (search by retailer name)
 *
 * Run: npm run retailers:load
 */

import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'retailers.get_list',           p95: 1100, p90: 1000 },
  { tag: 'retailers.get_by_location_id', p95: 1100, p90: 1000 },
  { tag: 'retailers.get_by_filter',      p95: 1100, p90: 1000 },
  { tag: 'retailers.get_by_search',      p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('retailers', ENDPOINTS),
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
    `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb/retailers?page=1&per_page=1&sort=created_at&desc=true`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`Could not fetch retailers in setup (HTTP ${res.status}): ${res.body}`);
  }

  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;

  if (!first) {
    throw new Error('No retailers found in the database — cannot run test without a valid locationId');
  }

  // Retailers use location_id (not id) as the route parameter
  const locationId = first.location_id || first.id;
  const retailerName = first.name || first.title || String(locationId);

  if (!locationId) {
    throw new Error(
      `Retailer location_id field missing.\nAvailable fields: ${Object.keys(first).join(', ')}\nFirst record: ${JSON.stringify(first)}`
    );
  }

  console.log(`[setup] Using locationId: ${locationId}, retailerName: ${retailerName}`);

  return { locationId, retailerName };
}

export default function ({ locationId, retailerName }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'retailers', ep: endpointTag },
    timeout: '10s',
  });

  // GET /retailers — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/retailers?page=1&per_page=100&sort=created_at&desc=true`,
    params('retailers.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                        (r) => r.status === 200,
    'get_list: has data':                                          (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['retailers.get_list']}ms`]:          (r) => r.timings.duration < limit['retailers.get_list'],
  }, { module: 'retailers', ep: 'retailers.get_list' });

  // GET /retailers/:location_id
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (locationId) {
    const byLocationRes = k6.http.get(
      `${base}/retailers/${locationId}`,
      params('retailers.get_by_location_id')
    );
    k6.check(byLocationRes, {
      'get_by_location_id: status 200':                                         (r) => r.status === 200,
      'get_by_location_id: has location_id':                                    (r) => { try { const b = JSON.parse(r.body); return !!(b.location_id || b.id); } catch { return false; } },
      [`get_by_location_id: under ${limit['retailers.get_by_location_id']}ms`]: (r) => r.timings.duration < limit['retailers.get_by_location_id'],
    }, { module: 'retailers', ep: 'retailers.get_by_location_id' });
  }

  // GET /retailers — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/retailers?page=1&per_page=100&sort=created_at&desc=true`,
    params('retailers.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                       (r) => r.status === 200,
    'get_by_filter: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['retailers.get_by_filter']}ms`]:    (r) => r.timings.duration < limit['retailers.get_by_filter'],
  }, { module: 'retailers', ep: 'retailers.get_by_filter' });

  // GET /retailers?search=:name
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (retailerName) {
    const searchRes = k6.http.get(
      `${base}/retailers?search=${encodeURIComponent(retailerName)}&sort=created_at&desc=true`,
      params('retailers.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                       (r) => r.status === 200,
      'get_by_search: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['retailers.get_by_search']}ms`]:    (r) => r.timings.duration < limit['retailers.get_by_search'],
    }, { module: 'retailers', ep: 'retailers.get_by_search' });
  }
}

export function teardown({ locationId }) {
  console.log(`Retailers load test complete. locationId used: ${locationId}`);
}

const REPORT_CONFIG = {
  title:    'Retailers Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'retailers',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'retailers.get_list':           'GET /retailers (list)',
      'retailers.get_by_location_id': 'GET /retailers/:location_id',
      'retailers.get_by_filter':      'GET /retailers (filter)',
      'retailers.get_by_search':      'GET /retailers?search=:name',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/load/reports/retailers-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
