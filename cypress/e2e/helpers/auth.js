/**
 * Shared auth helper for all k6 load tests.
 *
 * Each VU gets its own token stored in module-level variables.
 * The token is reused across iterations and only refreshed when
 * it's close to expiring (within 5 minutes of the JWT exp claim).
 */

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL        = __ENV.BASE_URL;
const API_VERSION     = __ENV.API_VERSION || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY;
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET;
const COMPANY_ID      = __ENV.COMPANY_ID;

// Per-VU state — module-level vars persist across iterations for the same VU
let token     = null;
let companyId = null;
let expiry    = 0;

/**
 * Returns a valid token for the current VU.
 * Call this inside default() so each VU manages its own session.
 */
export function getToken() {
  const fiveMinutes = 5 * 60 * 1000;
  if (token && Date.now() < expiry - fiveMinutes) {
    return { token, companyId };
  }
  return login();
}

/**
 * Validates credentials before the test starts.
 * Call this inside setup() to fail fast if auth is broken.
 */
export function setupAuth() {
  const result = login();
  check({ ok: result.token ? 1 : 0 }, {
    'auth: login succeeded': (r) => r.ok === 1,
  });
  return result;
}

function login() {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'login: status 200':   (r) => r.status === 200,
    'login: has token':    (r) => {
      try { return !!JSON.parse(r.body).token; } catch { return false; }
    },
  });

  if (res.status !== 200) {
    console.error(`[auth] Login failed (HTTP ${res.status}) — falling back to existing token`);
    return { token, companyId };
  }

  const body = JSON.parse(res.body);
  token     = body.token;
  companyId = body.company_id || COMPANY_ID;

  // Decode the JWT exp claim to know exactly when the token expires.
  // atob is built into k6 so no extra library needed.
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    expiry = payload.exp * 1000;
  } catch {
    expiry = Date.now() + 60 * 60 * 1000; // default to 1 hour if decode fails
  }

  return { token, companyId };
}
