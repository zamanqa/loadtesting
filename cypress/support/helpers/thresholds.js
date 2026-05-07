/**
 * Shared threshold builder for k6 load tests.
 *
 * Usage in any test file:
 *
 *   import { buildThresholds } from '../../support/helpers/thresholds.js';
 *
 *   const ENDPOINTS = [
 *     { tag: 'orders.get_list', p95: 500 },
 *     { tag: 'orders.get_by_id', p95: 500 },
 *   ];
 *
 *   export const options = {
 *     thresholds: buildThresholds('orders', ENDPOINTS),
 *     scenarios: { ... },
 *   };
 *
 * This generates three levels of thresholds automatically:
 *   1. Global   — applies to every request across the whole test
 *   2. Module   — aggregates all endpoints in the file under one group tag
 *   3. Endpoint — individual threshold per request type
 */

/**
 * Build a complete k6 thresholds block with three levels of coverage.
 *
 * @param {string} module    - Module name used as the group tag, e.g. 'orders', 'auth'
 * @param {Array}  endpoints - Array of endpoint descriptor objects:
 *   @param {string} endpoints[].tag  - Full endpoint tag, e.g. 'orders.get_list'
 *   @param {number} endpoints[].p95  - p95 response time limit in milliseconds
 *   @param {number} [endpoints[].p99] - p99 limit in ms. Defaults to p95 × 2 when omitted.
 *
 * @returns {object} A k6-compatible thresholds object
 */
export function buildThresholds(module, endpoints) {
  const thresholds = {
    // ── Level 1: Global ──────────────────────────────────────────────────────
    // These catch any request not explicitly tagged with an endpoint or module.
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],

    // ── Level 2: Module group ─────────────────────────────────────────────────
    // All requests tagged { module: '<module>' } are aggregated here.
    // This gives a single "how did the whole orders suite do?" view.
    [`http_req_duration{module:${module}}`]: ['p(95)<500', 'p(99)<1000'],
    [`http_req_failed{module:${module}}`]:   ['rate<0.01'],
    [`http_reqs{module:${module}}`]:         ['rate>1'],  // sanity check: confirms load is actually running
  };

  // ── Level 3: Per-endpoint ─────────────────────────────────────────────────
  // One threshold block per endpoint tag — p95, p99, error rate, and check pass rate.
  for (const { tag, p95, p99 } of endpoints) {
    const p99limit = p99 ?? Math.round(p95 * 2);

    thresholds[`http_req_duration{endpoint:${tag}}`] = [
      `p(95)<${p95}`,
      `p(99)<${p99limit}`,
    ];
    thresholds[`http_req_failed{endpoint:${tag}}`] = ['rate<0.01'];

    // check() assertions: at least 95% of them must pass for this endpoint
    thresholds[`checks{endpoint:${tag}}`] = ['rate>0.95'];
  }

  return thresholds;
}
