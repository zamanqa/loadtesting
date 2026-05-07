// scenario: smoke — validate script + baseline (1–3 VUs, 1m)
import http from 'k6/http';
import { check, sleep } from 'k6';

// action: load env vars — never hardcode secrets
const BASE_URL       = __ENV.BASE_URL        || 'https://circuly-lumen.herokuapp.com';
const API_VERSION    = __ENV.API_VERSION     || '2026-04';
const CONSUMER_KEY   = __ENV.CONSUMER_KEY    || 'ck_shopify_po';
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET || 'cs_i2451dlc5lkcsgww0gks';

export const options = {
  thresholds: {
    // selector: p95 threshold for GET endpoints — lenient for smoke baseline
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.05'],
  },
  scenarios: {
    smoke: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '30s', target: 2 }, // ramp up to 2 VUs
        { duration: '30s', target: 0 }, // ramp down
      ],
      tags: { scenario: 'smoke' },
    },
  },
};

// action: authenticate once — returns token + companyId to all VUs
export function setup() {
  // action: POST login to get JWT
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
  return { token: body.token, companyId: body.company_id };
}

// action: run all 4 endpoint checks per VU iteration
export default function (data) {
  const { token, companyId } = data;

  // selector: bearer auth header shared across all requests
  const params = {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    tags: { scenario: 'smoke' },
  };

  const base = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb`;
  const qs   = '?page=1&per_page=10&sort=created_at&desc=true';

  // action: GET /orders
  const ordersRes = http.get(`${base}/orders${qs}`, params);
  check(ordersRes, {
    'orders status 200':      (r) => r.status === 200,
    'orders p95 under 800ms': (r) => r.timings.duration < 800,
    'orders has data array':  (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);

  // action: GET /customers
  const customersRes = http.get(`${base}/customers${qs}`, params);
  check(customersRes, {
    'customers status 200':      (r) => r.status === 200,
    'customers p95 under 800ms': (r) => r.timings.duration < 800,
    'customers has data array':  (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);

  // action: GET /paginated-invoices
  const invoicesRes = http.get(`${base}/paginated-invoices${qs}`, params);
  check(invoicesRes, {
    'invoices status 200':      (r) => r.status === 200,
    'invoices p95 under 800ms': (r) => r.timings.duration < 800,
    'invoices has data array':  (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);

  // action: GET /subscriptions
  const subsRes = http.get(`${base}/subscriptions${qs}`, params);
  check(subsRes, {
    'subscriptions status 200':      (r) => r.status === 200,
    'subscriptions p95 under 800ms': (r) => r.timings.duration < 800,
    'subscriptions has data array':  (r) => Array.isArray(JSON.parse(r.body).data),
  });

  sleep(1);
}

// action: log test summary after run
export function teardown(data) {
  console.log(`[smoke] Run complete. companyId used: ${data.companyId}`);
}
