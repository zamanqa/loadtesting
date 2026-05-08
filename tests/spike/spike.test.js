// scenario: spike — sudden traffic burst (500 VUs = 100×5, ~50s)
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL        = __ENV.BASE_URL         || 'https://circuly-lumen.herokuapp.com';
const API_VERSION     = __ENV.API_VERSION      || '2026-04';
const CONSUMER_KEY    = __ENV.CONSUMER_KEY     || 'ck_shopify_po';
const CONSUMER_SECRET = __ENV.CONSUMER_SECRET  || 'cs_i2451dlc5lkcsgww0gks';

export const options = {
  thresholds: {
    // selector: spike thresholds — allow degradation, reject total failure
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.10'],
    'http_req_duration{endpoint:orders}':       ['p(95)<3000'],
    'http_req_duration{endpoint:customers}':    ['p(95)<3000'],
    'http_req_duration{endpoint:invoices}':     ['p(95)<3000'],
    'http_req_duration{endpoint:subscriptions}':['p(95)<3000'],
  },
  scenarios: {
    spike: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '10s', target: 500 }, // instant spike to 500 VUs (100 × 5)
        { duration: '30s', target: 500 }, // hold spike — observe failures/timeouts
        { duration: '10s', target: 0   }, // drop back to 0
      ],
      tags: { scenario: 'spike' },
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
    tags: { scenario: 'spike', endpoint },
    // action: long timeout — server may queue requests under spike
    timeout: '15s',
  });

  const base = `${BASE_URL}/${API_VERSION}/${companyId}/circulydb`;
  // action: reduced page size during spike to ease server load per request
  const qs = '?page=1&per_page=10&sort=created_at&desc=true';

  // action: GET /orders during spike
  const ordersRes = http.get(`${base}/orders${qs}`, params('orders'));
  check(ordersRes, {
    'orders not 5xx':          (r) => r.status < 500,
    'orders not 429':          (r) => r.status !== 429,
    'orders p95 under 3000ms': (r) => r.timings.duration < 3000,
  });

  // action: minimal sleep — spike tests deliberately skip pausing
  sleep(0.1);

  // action: GET /customers during spike
  const customersRes = http.get(`${base}/customers${qs}`, params('customers'));
  check(customersRes, {
    'customers not 5xx':          (r) => r.status < 500,
    'customers not 429':          (r) => r.status !== 429,
    'customers p95 under 3000ms': (r) => r.timings.duration < 3000,
  });

  sleep(0.1);

  // action: GET /paginated-invoices during spike
  const invoicesRes = http.get(`${base}/paginated-invoices${qs}`, params('invoices'));
  check(invoicesRes, {
    'invoices not 5xx':          (r) => r.status < 500,
    'invoices not 429':          (r) => r.status !== 429,
    'invoices p95 under 3000ms': (r) => r.timings.duration < 3000,
  });

  sleep(0.1);

  // action: GET /subscriptions during spike
  const subsRes = http.get(`${base}/subscriptions${qs}`, params('subscriptions'));
  check(subsRes, {
    'subscriptions not 5xx':          (r) => r.status < 500,
    'subscriptions not 429':          (r) => r.status !== 429,
    'subscriptions p95 under 3000ms': (r) => r.timings.duration < 3000,
  });

  sleep(0.1);
}

export function teardown(data) {
  console.log(`[spike] Run complete. companyId: ${data.companyId}`);
  console.log('[spike] Check for HTTP 429 or 503 — WAF/rate-limit may have triggered.');
}
