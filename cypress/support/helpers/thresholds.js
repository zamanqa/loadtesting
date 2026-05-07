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
  // Derive limits from the slowest endpoint so global and module thresholds
  // never fire just because one module (e.g. auth) has a higher budget than 500ms.
  const maxP95 = Math.max(...endpoints.map((e) => e.p95));
  const maxP99 = Math.max(...endpoints.map((e) => e.p99 ?? Math.round(e.p95 * 2)));

  const thresholds = {
    // ── Level 1: Global ──────────────────────────────────────────────────────
    // Uses the slowest endpoint's limit so a high-budget module (e.g. auth at
    // 800ms) doesn't trip the global gate that was meant for fast read endpoints.
    http_req_duration: [`p(95)<${maxP95}`],
    http_req_failed:   ['rate<0.01'],

    // ── Level 2: Module group ─────────────────────────────────────────────────
    // All requests tagged { module: '<module>' } are aggregated here.
    // This gives a single "how did the whole module do?" view.
    [`http_req_duration{module:${module}}`]: [`p(95)<${maxP95}`, `p(99)<${maxP99}`],
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
