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
 * Percentile defaults (derived from p95 when not specified):
 *   p90 = p95 × 0.80  (tighter gate — 80% of the p95 budget)
 *
 * This generates three levels of thresholds automatically:
 *   1. Global   — applies to every request across the whole test
 *   2. Module   — aggregates all endpoints in the file under one group tag
 *   3. Endpoint — individual threshold per request type (p90 + p95)
 */

/**
 * Build a complete k6 thresholds block with three levels of coverage.
 *
 * @param {string} module    - Module name used as the group tag, e.g. 'orders', 'auth'
 * @param {Array}  endpoints - Array of endpoint descriptor objects:
 *   @param {string} endpoints[].tag   - Full endpoint tag, e.g. 'orders.get_list'
 *   @param {number} endpoints[].p95   - p95 response time limit in ms
 *   @param {number} [endpoints[].p90] - p90 limit in ms. Defaults to p95 × 0.80.
 *
 * @returns {object} A k6-compatible thresholds object
 */
export function buildThresholds(module, endpoints) {
  // Derive global and module limits from the slowest endpoint so a high-budget
  // module (e.g. auth at 800ms) doesn't trip a gate meant for fast read endpoints.
  const maxP95 = Math.max(...endpoints.map((e) => e.p95));
  const maxP90 = Math.max(...endpoints.map((e) => e.p90 ?? Math.round(e.p95 * 0.80)));

  const thresholds = {
    // ── Level 1: Global ──────────────────────────────────────────────────────
    http_req_duration: [`p(95)<${maxP95}`],
    http_req_failed:   ['rate<0.01'],

    // ── Level 2: Module group ─────────────────────────────────────────────────
    // All requests tagged { module: '<module>' } are aggregated here.
    [`http_req_duration{module:${module}}`]: [`p(90)<${maxP90}`, `p(95)<${maxP95}`],
    [`http_req_failed{module:${module}}`]:   ['rate<0.01'],
    [`http_reqs{module:${module}}`]:         ['rate>1'],
  };

  // ── Level 3: Per-endpoint ─────────────────────────────────────────────────
  for (const { tag, p95, p90 } of endpoints) {
    const p90limit = p90 ?? Math.round(p95 * 0.80);

    thresholds[`http_req_duration{endpoint:${tag}}`] = [
      `p(90)<${p90limit}`,
      `p(95)<${p95}`,
    ];
    thresholds[`http_req_failed{endpoint:${tag}}`] = ['rate<0.01'];

    // check() assertions: at least 95% of them must pass for this endpoint
    thresholds[`checks{endpoint:${tag}}`] = ['rate>0.95'];
  }

  return thresholds;
}
