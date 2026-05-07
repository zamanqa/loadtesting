// shared auth module — imported by all load test files
// per-VU token cache: module-level variables persist across iterations for each VU
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL        = __ENV.BASE_URL;
const API_VERSION     = __ENV.API_VERSION     || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY;
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET;
const COMPANY_ID      = __ENV.COMPANY_ID;

let _token     = null;
let _companyId = null;
let _expiry    = 0;

// action: call this in default() — returns cached token, re-logins only when expired
export function getToken() {
  if (_token && Date.now() < _expiry - 300_000) {
    return { token: _token, companyId: _companyId };
  }
  return _doLogin();
}

// action: call this in setup() — validates credentials once before VUs start
export function setupAuth() {
  const result = _doLogin();
  check({ status: result.token ? 1 : 0 }, {
    'setup: auth succeeded': (s) => s.status === 1,
  });
  return result;
}

function _doLogin() {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'auth: login 200':    (r) => r.status === 200,
    'auth: token exists': (r) => {
      try { return !!JSON.parse(r.body).token; } catch { return false; }
    },
  });

  if (res.status !== 200) {
    console.error(`[auth] Login failed: HTTP ${res.status} — using stale token if available`);
    return { token: _token, companyId: _companyId };
  }

  const body = JSON.parse(res.body);
  _token     = body.token;
  _companyId = body.company_id || COMPANY_ID;

  // action: decode JWT exp claim — no external libs, atob is available in k6
  try {
    const payload = JSON.parse(atob(_token.split('.')[1]));
    _expiry = payload.exp * 1000;
  } catch {
    _expiry = Date.now() + 3_600_000; // fallback: 1 hour
  }

  return { token: _token, companyId: _companyId };
}
