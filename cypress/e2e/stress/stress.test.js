// scenario: stress — find breaking point (200 VUs = 100×2, 10m total)
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL        = __ENV.BASE_URL         || 'https://circuly-lumen.herokuapp.com';
const API_VERSION     = __ENV.API_VERSION      || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY     || 'ck_shopify_po';
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET  || 'cs_i2451dlc5lkcsgww0gks';

export const options = {
  thresholds: {
    // selector: stress thresholds are more lenient — goal is finding the break point
    http_req_duration: ['p(95)<1500'],
    http_req_failed:   ['rate<0.05'],
    'http_req_duration{endpoint:orders}':       ['p(95)<1500'],
    'http_req_duration{endpoint:customers}':    ['p(95)<1500'],
    'http_req_duration{endpoint:invoices}':     ['p(95)<1500'],
    'http_req_duration{endpoint:subscriptions}':['p(95)<1500'],
  },
  scenarios: {
    stress: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '3m', target: 200 }, // ramp up to 200 VUs (100 × 2)
        { duration: '5m', target: 200 }, // hold at peak — watch for failures
        { duration: '2m', target: 0   }, // ramp down
      ],
      tags: { scenario: 'stress' },
    },
  },
};

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
  return { token: body.token, companyId: body.company_id };
}

export default function (data) {
  const { token, companyId } = data;

  const params = (endpoint) => ({
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    tags: { scenario: 'stress', endpoint },
    // action: set timeout higher — server may slow under stress
    timeout: '10s',
  });

  const base = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb`;
  const qs   = '?page=1&per_page=100&sort=created_at&desc=true';

  // action: GET /orders under stress load
  const ordersRes = http.get(`${base}/orders${qs}`, params('orders'));
  check(ordersRes, {
    'orders not 5xx':         (r) => r.status < 500,
    'orders not rate limited':(r) => r.status !== 429,
    'orders p95 under 1500ms':(r) => r.timings.duration < 1500,
  });

  sleep(0.5);

  // action: GET /customers under stress load
  const customersRes = http.get(`${base}/customers${qs}`, params('customers'));
  check(customersRes, {
    'customers not 5xx':         (r) => r.status < 500,
    'customers not rate limited':(r) => r.status !== 429,
    'customers p95 under 1500ms':(r) => r.timings.duration < 1500,
  });

  sleep(0.5);

  // action: GET /paginated-invoices under stress load
  const invoicesRes = http.get(`${base}/paginated-invoices${qs}`, params('invoices'));
  check(invoicesRes, {
    'invoices not 5xx':         (r) => r.status < 500,
    'invoices not rate limited':(r) => r.status !== 429,
    'invoices p95 under 1500ms':(r) => r.timings.duration < 1500,
  });

  sleep(0.5);

  // action: GET /subscriptions under stress load
  const subsRes = http.get(`${base}/subscriptions${qs}`, params('subscriptions'));
  check(subsRes, {
    'subscriptions not 5xx':         (r) => r.status < 500,
    'subscriptions not rate limited':(r) => r.status !== 429,
    'subscriptions p95 under 1500ms':(r) => r.timings.duration < 1500,
  });

  sleep(0.5);
}

export function teardown(data) {
  console.log(`[stress] Run complete. companyId: ${data.companyId}`);
  console.log('[stress] Review p95 and error rate for threshold breaches.');
}
