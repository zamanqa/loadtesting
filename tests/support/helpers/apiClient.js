/**
 * k6-native API client for the Unified Customer API (2026-04).
 *
 * URL patterns:
 *   circulydb  → {BASE_URL}/{API_VERSION}/{companyId}/circulydb{endpoint}
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
  const url = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb${endpoint}`;
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
