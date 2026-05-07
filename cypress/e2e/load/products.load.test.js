/**
 * Load test — Products / Product Variants module (all GET endpoints)
 *
 * Covers 5 endpoints:
 *   GET /products                               (product list)
 *   GET /products/:id/variants                  (variants for a product)
 *   GET /products/variants                      (all variants list)
 *   GET /products?page=1&per_page=100&sort=...  (filter)
 *   GET /products?search=:title                 (search by product title)
 *
 * Run: npm run products:load
 */

import * as k6 from '../../support/helpers/k6.js';
import { getToken, setupAuth } from '../../support/helpers/auth.js';
import { buildHtmlReport } from '../../support/helpers/report.js';
import { buildThresholds } from '../../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

const ENDPOINTS = [
  { tag: 'products.get_list',          p95: 1100, p90: 1000 },
  { tag: 'products.get_variants',      p95: 1100, p90: 1000 },
  { tag: 'products.get_all_variants',  p95: 1100, p90: 1000 },
  { tag: 'products.get_by_filter',     p95: 1100, p90: 1000 },
  { tag: 'products.get_by_search',     p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

export const options = {
  thresholds: buildThresholds('products', ENDPOINTS),
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
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  // Fetch first product for id and title
  const productsRes = k6.http.get(
    `${base}/products?page=1&per_page=1&sort=created_at&desc=true`,
    { headers }
  );

  if (productsRes.status !== 200) {
    throw new Error(`Could not fetch products in setup (HTTP ${productsRes.status}): ${productsRes.body}`);
  }

  const productsBody = JSON.parse(productsRes.body);
  const firstProduct = productsBody.data && productsBody.data.length > 0 ? productsBody.data[0] : null;

  if (!firstProduct) {
    throw new Error('No products found in the database — cannot run test without a valid productId');
  }

  const productId = firstProduct.id;
  const productTitle = firstProduct.title || firstProduct.name || String(productId);

  if (!productId) {
    throw new Error(
      `Product ID field missing.\nAvailable fields: ${Object.keys(firstProduct).join(', ')}\nFirst record: ${JSON.stringify(firstProduct)}`
    );
  }

  console.log(`[setup] Using productId: ${productId}, productTitle: ${productTitle}`);

  return { productId, productTitle };
}

export default function ({ productId, productTitle }) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const params = (endpointTag) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { scenario: 'load', module: 'products', ep: endpointTag },
    timeout: '10s',
  });

  // GET /products — paginated list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const listRes = k6.http.get(
    `${base}/products?page=1&per_page=100&sort=created_at&desc=true`,
    params('products.get_list')
  );
  k6.check(listRes, {
    'get_list: status 200':                                      (r) => r.status === 200,
    'get_list: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['products.get_list']}ms`]:         (r) => r.timings.duration < limit['products.get_list'],
  }, { module: 'products', ep: 'products.get_list' });

  // GET /products/:id/variants
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (productId) {
    const variantsRes = k6.http.get(
      `${base}/products/${productId}/variants`,
      params('products.get_variants')
    );
    k6.check(variantsRes, {
      'get_variants: status 200':                                      (r) => r.status === 200,
      'get_variants: has data':                                        (r) => { try { const b = JSON.parse(r.body); return Array.isArray(b.data || b); } catch { return false; } },
      [`get_variants: under ${limit['products.get_variants']}ms`]:     (r) => r.timings.duration < limit['products.get_variants'],
    }, { module: 'products', ep: 'products.get_variants' });
  }

  // GET /products/variants — all variants list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const allVariantsRes = k6.http.get(
    `${base}/products/variants?page=1&per_page=100&sort=created_at&desc=true`,
    params('products.get_all_variants')
  );
  k6.check(allVariantsRes, {
    'get_all_variants: status 200':                                      (r) => r.status === 200,
    'get_all_variants: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_all_variants: under ${limit['products.get_all_variants']}ms`]: (r) => r.timings.duration < limit['products.get_all_variants'],
  }, { module: 'products', ep: 'products.get_all_variants' });

  // GET /products — filter
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const filterRes = k6.http.get(
    `${base}/products?page=1&per_page=100&sort=created_at&desc=true`,
    params('products.get_by_filter')
  );
  k6.check(filterRes, {
    'get_by_filter: status 200':                                     (r) => r.status === 200,
    'get_by_filter: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['products.get_by_filter']}ms`]:   (r) => r.timings.duration < limit['products.get_by_filter'],
  }, { module: 'products', ep: 'products.get_by_filter' });

  // GET /products?search=:title
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  if (productTitle) {
    const searchRes = k6.http.get(
      `${base}/products?search=${encodeURIComponent(productTitle)}&sort=created_at&desc=true`,
      params('products.get_by_search')
    );
    k6.check(searchRes, {
      'get_by_search: status 200':                                     (r) => r.status === 200,
      'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
      [`get_by_search: under ${limit['products.get_by_search']}ms`]:   (r) => r.timings.duration < limit['products.get_by_search'],
    }, { module: 'products', ep: 'products.get_by_search' });
  }
}

export function teardown({ productId }) {
  console.log(`Products load test complete. productId used: ${productId}`);
}

const REPORT_CONFIG = {
  title:    'Products Load Test Report',
  subtitle: '5 VUs · 15s',
  module:   'products',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'products.get_list':         'GET /products (list)',
      'products.get_variants':     'GET /products/:id/variants',
      'products.get_all_variants': 'GET /products/variants (all)',
      'products.get_by_filter':    'GET /products (filter)',
      'products.get_by_search':    'GET /products?search=:title',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'cypress/e2e/load/reports/products-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
