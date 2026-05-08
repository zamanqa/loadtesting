/**
 * k6-native API client for the Unified Customer API (2026-04).
 *
 * URL patterns:
 *   circulydb  → {BASE_URL}/{API_VERSION}/{companyId}{endpoint}
 *   css        → {BASE_URL}/{API_VERSION}{endpoint}  (endpoint starts with /css/)
 *   debtist    → {BASE_URL}/{API_VERSION}/{companyId}{endpoint}
 */

import http from 'k6/http';
import { BASE_URL, API_VERSION } from './k6.js';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function params(token, extra = {}) {
  return { headers: headers(token), ...extra };
}

export function circulydbRequest(method, endpoint, token, companyId, options = {}) {
  const url = `${BASE_URL}/${API_VERSION}/${companyId}${endpoint}`;
  const body = options.body ? JSON.stringify(options.body) : null;
  return http.request(method, url, body, params(token, options.tags ? { tags: options.tags } : {}));
}

export function cssRequest(method, endpoint, token, options = {}) {
  const url = `${BASE_URL}/${API_VERSION}${endpoint}`;
  const body = options.body ? JSON.stringify(options.body) : null;
  return http.request(method, url, body, params(token, options.tags ? { tags: options.tags } : {}));
}

export function debtistRequest(method, endpoint, token, companyId, options = {}) {
  const url = `${BASE_URL}/${API_VERSION}/${companyId}${endpoint}`;
  const body = options.body ? JSON.stringify(options.body) : null;
  return http.request(method, url, body, params(token, options.tags ? { tags: options.tags } : {}));
}

/**
 * Returns a k6 request params factory pre-bound to a token, scenario tag, and timeout.
 * Use inside default() to avoid repeating the same header/tag block per request.
 *
 * @param {string} token    - Bearer token for Authorization header
 * @param {string} scenario - Scenario name used in the k6 tags (e.g. 'load', 'stress')
 * @param {string} timeout  - k6 request timeout string (e.g. '10s', '20s')
 * @returns {function(module: string, ep: string): object} k6 params object
 */
export function makeParams(token, scenario, timeout) {
  return (module, ep) => ({
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    tags: { scenario, module, ep },
    timeout,
  });
}
