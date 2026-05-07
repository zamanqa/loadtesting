// scenario: soak — detect memory leaks + degradation over time (70 VUs, 35m)
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL        = __ENV.BASE_URL         || 'https://circuly-lumen.herokuapp.com';
const API_VERSION     = __ENV.API_VERSION      || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY     || 'ck_shopify_po';
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET  || 'cs_i2451dlc5lkcsgww0gks';

export const options = {
  thresholds: {
    // selector: soak thresholds — watch for gradual drift above baseline
    http_req_duration: ['p(95)<600'],
    http_req_failed:   ['rate<0.01'],
    'http_req_duration{endpoint:orders}':       ['p(95)<600'],
    'http_req_duration{endpoint:customers}':    ['p(95)<600'],
    'http_req_duration{endpoint:invoices}':     ['p(95)<600'],
    'http_req_duration{endpoint:subscriptions}':['p(95)<600'],
  },
  scenarios: {
    soak: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '2m',  target: 70 },  // ramp up to 70 VUs (100 × 0.7)
        { duration: '30m', target: 70 },  // hold — monitor for memory leaks
        { duration: '3m',  target: 0  },  // ramp down
      ],
      tags: { scenario: 'soak' },
    },
  },
};

// action: per-VU token state — soak tests run 30+ min; JWT may expire
// each VU manages its own token and refreshes when needed
let vuToken     = null;
let vuCompanyId = null;
let vuTokenExpiry = 0;

function getToken() {
  // action: re-authenticate if token is missing or within 5 min of expiry
  if (vuToken && Date.now() < vuTokenExpiry - 300000) {
    return { token: vuToken, companyId: vuCompanyId };
  }

  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    console.error(`[soak] Re-auth failed: ${res.status} ${res.body}`);
    return { token: vuToken, companyId: vuCompanyId }; // use stale token as fallback
  }

  const body = JSON.parse(res.body);

  // action: decode JWT exp claim to track expiry without external libs
  try {
    const payload = JSON.parse(atob(body.token.split('.')[1]));
    vuTokenExpiry = payload.exp * 1000;
  } catch {
    vuTokenExpiry = Date.now() + 3600000; // fallback: 1h
  }

  vuToken     = body.token;
  vuCompanyId = body.company_id;
  return { token: vuToken, companyId: vuCompanyId };
}

// action: setup() still runs once to validate credentials before VUs start
export function setup() {
  const res = http.post(
    `${BASE_URL}/${API_VERSION}/auth/login`,
    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'login status is 200': (r) => r.status === 200,
    'token returned':      (r) => JSON.parse(r.body).token !== undefined,
  });

  const body = JSON.parse(res.body);
  return { companyId: body.company_id };
}

export default function () {
  // action: per-VU token refresh — handles JWT expiry during long soak
  const { token, companyId } = getToken();
  if (!token) {
    console.error('[soak] No token available — skipping iteration');
    sleep(5);
    return;
  }

  const params = (endpoint) => ({
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    tags: { scenario: 'soak', endpoint },
  });

  const base = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb`;
  const qs   = '?page=1&per_page=100&sort=created_at&desc=true';

  // action: GET /orders — monitor p95 drift over time
  const ordersRes = http.get(`${base}/orders${qs}`, params('orders'));
  check(ordersRes, {
    'orders status 200':     (r) => r.status === 200,
    'orders under 600ms':    (r) => r.timings.duration < 600,
    'orders has data':       (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);

  // action: GET /customers — monitor p95 drift over time
  const customersRes = http.get(`${base}/customers${qs}`, params('customers'));
  check(customersRes, {
    'customers status 200':  (r) => r.status === 200,
    'customers under 600ms': (r) => r.timings.duration < 600,
    'customers has data':    (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);

  // action: GET /paginated-invoices — monitor p95 drift over time
  const invoicesRes = http.get(`${base}/paginated-invoices${qs}`, params('invoices'));
  check(invoicesRes, {
    'invoices status 200':   (r) => r.status === 200,
    'invoices under 600ms':  (r) => r.timings.duration < 600,
    'invoices has data':     (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);

  // action: GET /subscriptions — monitor p95 drift over time
  const subsRes = http.get(`${base}/subscriptions${qs}`, params('subscriptions'));
  check(subsRes, {
    'subscriptions status 200':  (r) => r.status === 200,
    'subscriptions under 600ms': (r) => r.timings.duration < 600,
    'subscriptions has data':    (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(2);
}

export function teardown(data) {
  console.log(`[soak] 35m run complete. companyId: ${data.companyId}`);
  console.log('[soak] Compare p95 at t=2m vs t=30m — significant drift = memory leak.');
}
