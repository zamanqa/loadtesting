/**
 * Central re-export hub for k6 built-ins, remote libs, and environment variables.
 *
 * Import everything a test file needs from here instead of repeating the same
 * boilerplate at the top of every test file:
 *
 *   import { http, check, sleep, textSummary, BASE_URL, API_VERSION } from '../../support/helpers/k6.js';
 *
 * For auth-focused tests that need credentials directly:
 *
 *   import { http, check, sleep, textSummary, BASE_URL, API_VERSION, CONSUMER_KEY, CONSUMER_SECRET } from '../../support/helpers/k6.js';
 */

// k6 built-in modules
export { default as http } from 'k6/http';
export { check, sleep }    from 'k6';

// k6 remote summary helper — produces the default terminal output table
export { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Environment variables loaded from .env via dotenv-cli before k6 runs.
// __ENV is a k6 global available in every module.
export const BASE_URL        = __ENV.BASE_URL;
export const API_VERSION     = __ENV.API_VERSION || '2026-04';
export const CONSUMER_KEY    = __ENV.CONSUMER_KEY;
export const CONSUMER_SECRET = __ENV.CONSUMER_SECRET;

// Per-test request timeouts — override via .env to tune for your environment.
export const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '10s'; // load, soak
export const STRESS_TIMEOUT  = __ENV.STRESS_TIMEOUT  || '20s'; // stress — server may slow under 150 VUs

// Trend stats written into the k6 summary data object used by handleSummary.
// Import and spread into options.summaryTrendStats so p50/p99 appear in reports.
export const SUMMARY_TREND_STATS = ['avg', 'min', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'];

// Grafana k6 Cloud config — run tests from Frankfurt (same region as the API).
// Pass to options.cloud: `cloud: cloudConfig('My Test Name')`.
export function cloudConfig(name) {
  return {
    projectID:    7491665,
    name,
    distribution: { frankfurt: { loadZone: 'amazon:de:frankfurt', percent: 100 } },
  };
}
