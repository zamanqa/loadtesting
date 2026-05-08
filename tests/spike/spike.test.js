/**
 * Spike test — All modules combined
 *
 * Purpose : Test server survival under a sudden, extreme burst of traffic.
 *           Simulates a flash-sale or DDoS-like event: 0 → 500 VUs in 10 seconds,
 *           held for 30 seconds, then dropped. Covers all 44 GET endpoints.
 *
 * VU profile:
 *   0 → 500 VUs  (10s)  — instant spike
 *      500 VUs   (30s)  — hold — observe 429s, 5xxs, and timeouts
 *        0 VUs   (10s)  — rapid drop
 *   Total: ~50 seconds
 *
 * Unlike load/soak/stress, spike does NOT use per-VU token refresh — the ~50s run
 * is well within JWT expiry, so setup() fetches one token and passes it via data.
 *
 * Thresholds are intentionally relaxed (3× load p95, 10% error rate, 90% check
 * pass rate) — the goal is to detect total failures and rate-limit kicks (HTTP
 * 429/503), not regressions.
 *
 * Modules covered: Orders (6) · Subscriptions (4) · Customers (5) · Invoices (4)
 *                  Transactions (4) · Draft Orders (4) · Recurring Payments (4)
 *                  Products (5) · Retailers (4) · Vouchers (4)
 * Total: 44 endpoints per iteration
 *
 * Run: npm run all:spike
 */

// ─── Imports ──────────────────────────────────────────────────────────────────
import * as k6 from '../support/helpers/k6.js';
import { setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';
import { fetchAllIds } from '../support/helpers/setup.js';
import { makeParams } from '../support/helpers/apiClient.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SLEEP_BETWEEN_REQUESTS = 0.1; // spike: minimal pause to maximise burst pressure
const PER_PAGE = 10; // spike uses small pages — reduce per-request payload during burst

// ─── Endpoint definitions ─────────────────────────────────────────────────────
// p95 = 3× load baseline — spike allows heavy degradation; only total failure fails the test.
const ENDPOINTS = [
  // Orders
  { tag: 'orders.get_list',                p95: 6000,  p90: 5000 },
  { tag: 'orders.get_by_id',               p95: 4800,  p90: 4200 },
  { tag: 'orders.get_payment_update_link', p95: 3300,  p90: 3000 },
  { tag: 'orders.get_payment_methods',     p95: 3300,  p90: 3000 },
  { tag: 'orders.get_by_filter',           p95: 5700,  p90: 4800 },
  { tag: 'orders.get_by_search',           p95: 7800,  p90: 6600 },

  // Subscriptions
  { tag: 'subscriptions.get_list',         p95: 6000,  p90: 5700 },
  { tag: 'subscriptions.get_by_id',        p95: 3600,  p90: 3300 },
  { tag: 'subscriptions.get_by_filter',    p95: 4800,  p90: 4200 },
  { tag: 'subscriptions.get_by_search',    p95: 7800,  p90: 6600 },

  // Customers
  { tag: 'customers.get_list',             p95: 3300, p90: 3000 },
  { tag: 'customers.get_by_id',            p95: 3300, p90: 3000 },
  { tag: 'customers.get_balance',          p95: 3300, p90: 3000 },
  { tag: 'customers.get_by_filter',        p95: 3300, p90: 3000 },
  { tag: 'customers.get_by_search',        p95: 3300, p90: 3000 },

  // Invoices
  { tag: 'invoices.get_list',              p95: 4800, p90: 4200 },
  { tag: 'invoices.get_by_number',         p95: 5700, p90: 5400 },
  { tag: 'invoices.get_by_filter',         p95: 4800, p90: 4200 },
  { tag: 'invoices.get_by_search',         p95: 8400, p90: 6600 },

  // Transactions
  { tag: 'transactions.get_list',          p95: 4500, p90: 3900 },
  { tag: 'transactions.get_by_id',         p95: 3300, p90: 3000 },
  { tag: 'transactions.get_by_filter',     p95: 4500, p90: 3900 },
  { tag: 'transactions.get_by_search',     p95: 7500, p90: 6600 },

  // Draft Orders
  { tag: 'draft_orders.get_list',          p95: 3600, p90: 3300 },
  { tag: 'draft_orders.get_by_id',         p95: 3300, p90: 3000 },
  { tag: 'draft_orders.get_by_filter',     p95: 3600, p90: 3300 },
  { tag: 'draft_orders.get_by_search',     p95: 3900, p90: 3600 },

  // Recurring Payments
  { tag: 'recurring_payments.get_list',      p95: 5700,  p90: 4800 },
  { tag: 'recurring_payments.get_by_id',     p95: 3300,  p90: 3000 },
  { tag: 'recurring_payments.get_by_filter', p95: 5400,  p90: 4800 },
  { tag: 'recurring_payments.get_by_search', p95: 16500, p90: 13800 },

  // Products
  { tag: 'products.get_list',              p95: 3300, p90: 3000 },
  { tag: 'products.get_variants',          p95: 3300, p90: 3000 },
  { tag: 'products.get_all_variants',      p95: 4800, p90: 4500 },
  { tag: 'products.get_by_filter',         p95: 3300, p90: 3000 },
  { tag: 'products.get_by_search',         p95: 3300, p90: 3000 },

  // Retailers
  { tag: 'retailers.get_list',             p95: 3300, p90: 3000 },
  { tag: 'retailers.get_by_location_id',   p95: 3300, p90: 3000 },
  { tag: 'retailers.get_by_filter',        p95: 3300, p90: 3000 },
  { tag: 'retailers.get_by_search',        p95: 3300, p90: 3000 },

  // Vouchers
  { tag: 'vouchers.get_list',              p95: 3300, p90: 3000 },
  { tag: 'vouchers.get_by_code',           p95: 3300, p90: 3000 },
  { tag: 'vouchers.get_by_filter',         p95: 3300, p90: 3000 },
  { tag: 'vouchers.get_by_search',         p95: 3300, p90: 3000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Build thresholds then relax error rate (10%) and check pass rate (90%) for spike conditions.
// http_reqs{module:spike} is always 0 — requests are tagged with their own module names.
const baseThresholds = buildThresholds('spike', ENDPOINTS);
const spikeOverrides = Object.fromEntries([
  ...ENDPOINTS.map(({ tag }) => [`http_req_failed{ep:${tag}}`, ['rate<0.10']]),
  ...ENDPOINTS.map(({ tag }) => [`checks{ep:${tag}}`,          ['rate>0.90']]),
]);

// ─── Scenario options ─────────────────────────────────────────────────────────
export const options = {
  summaryTrendStats: k6.SUMMARY_TREND_STATS,
  thresholds: {
    ...baseThresholds,
    http_req_failed:                 ['rate<0.10'],
    'http_req_failed{module:spike}': ['rate<0.10'],
    'http_reqs{module:spike}':       ['rate>=0'],
    ...spikeOverrides,
  },
  scenarios: {
    spike: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '10s', target: 500 }, // instant spike — 0 → 500 VUs
        { duration: '30s', target: 500 }, // hold — observe failures / rate-limits
        { duration: '10s', target: 0   }, // rapid drop
      ],
      tags: { scenario: 'spike' },
    },
  },
};

// ─── Setup — fetch one token + one real ID per module ─────────────────────────
// Token is kept in data so VUs can use it directly (no per-VU refresh — run is ~50s).
export function setup() {
  const { token, companyId } = setupAuth();
  return { token, companyId, ...fetchAllIds(token, companyId) };
}

// ─── Default — each VU fires all 44 endpoints back-to-back ───────────────────
export default function (data) {
  // Single token from setup — no per-VU refresh (run is ~50s, well under JWT expiry)
  const { token, companyId } = data;
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}`;

  const {
    orderId, subscriptionId, customerId, invoiceNumber,
    transactionId, draftOrderId, draftOrderName,
    recurringPaymentId, recurringSubscriptionId,
    productId, productTitle, locationId, retailerName, voucherCode,
  } = data;

  const params = makeParams(token, 'spike', '15s');

  // ── ORDERS (6 endpoints) ─────────────────────────────────────────────────────

  // GET /orders — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersListRes = k6.http.get(`${base}/orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('orders', 'orders.get_list'));
  k6.check(ordersListRes, {
    'get_list: not 5xx':                                                   (r) => r.status < 500,
    'get_list: not 429':                                                   (r) => r.status !== 429,
    [`get_list: under ${limit['orders.get_list']}ms`]:                     (r) => r.timings.duration < limit['orders.get_list'],
  }, { module: 'orders', ep: 'orders.get_list' });

  // GET /orders/:id — single order by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderByIdRes = k6.http.get(`${base}/orders/${orderId}`, params('orders', 'orders.get_by_id'));
  k6.check(orderByIdRes, {
    'get_by_id: not 5xx':                                                  (r) => r.status < 500,
    'get_by_id: not 429':                                                  (r) => r.status !== 429,
    [`get_by_id: under ${limit['orders.get_by_id']}ms`]:                   (r) => r.timings.duration < limit['orders.get_by_id'],
  }, { module: 'orders', ep: 'orders.get_by_id' });

  // GET /orders/:id/payment-update-link — Stripe/Mollie hosted update URL
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderLinkRes = k6.http.get(`${base}/orders/${orderId}/payment-update-link`, params('orders', 'orders.get_payment_update_link'));
  k6.check(orderLinkRes, {
    'payment_update_link: not 5xx':                                                    (r) => r.status < 500,
    'payment_update_link: not 429':                                                    (r) => r.status !== 429,
    [`payment_update_link: under ${limit['orders.get_payment_update_link']}ms`]:       (r) => r.timings.duration < limit['orders.get_payment_update_link'],
  }, { module: 'orders', ep: 'orders.get_payment_update_link' });

  // GET /orders/:id/payment-methods — available payment methods for this order
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderMethodsRes = k6.http.get(`${base}/orders/${orderId}/payment-methods`, params('orders', 'orders.get_payment_methods'));
  k6.check(orderMethodsRes, {
    'payment_methods: not 5xx':                                                (r) => r.status < 500,
    'payment_methods: not 429':                                                (r) => r.status !== 429,
    [`payment_methods: under ${limit['orders.get_payment_methods']}ms`]:       (r) => r.timings.duration < limit['orders.get_payment_methods'],
  }, { module: 'orders', ep: 'orders.get_payment_methods' });

  // GET /orders?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersFilterRes = k6.http.get(`${base}/orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('orders', 'orders.get_by_filter'));
  k6.check(ordersFilterRes, {
    'get_by_filter: not 5xx':                                              (r) => r.status < 500,
    'get_by_filter: not 429':                                              (r) => r.status !== 429,
    [`get_by_filter: under ${limit['orders.get_by_filter']}ms`]:           (r) => r.timings.duration < limit['orders.get_by_filter'],
  }, { module: 'orders', ep: 'orders.get_by_filter' });

  // GET /orders?search= — full-text search by order ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersSearchRes = k6.http.get(`${base}/orders?search=${orderId}&sort=created_at&desc=true`, params('orders', 'orders.get_by_search'));
  k6.check(ordersSearchRes, {
    'get_by_search: not 5xx':                                              (r) => r.status < 500,
    'get_by_search: not 429':                                              (r) => r.status !== 429,
    [`get_by_search: under ${limit['orders.get_by_search']}ms`]:           (r) => r.timings.duration < limit['orders.get_by_search'],
  }, { module: 'orders', ep: 'orders.get_by_search' });

  // ── SUBSCRIPTIONS (4 endpoints) ──────────────────────────────────────────────

  // GET /subscriptions — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsListRes = k6.http.get(`${base}/subscriptions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_list'));
  k6.check(subsListRes, {
    'get_list: not 5xx':                                                       (r) => r.status < 500,
    'get_list: not 429':                                                       (r) => r.status !== 429,
    [`get_list: under ${limit['subscriptions.get_list']}ms`]:                  (r) => r.timings.duration < limit['subscriptions.get_list'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_list' });

  // GET /subscriptions/:id — single subscription by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subByIdRes = k6.http.get(`${base}/subscriptions/${subscriptionId}`, params('subscriptions', 'subscriptions.get_by_id'));
  k6.check(subByIdRes, {
    'get_by_id: not 5xx':                                                      (r) => r.status < 500,
    'get_by_id: not 429':                                                      (r) => r.status !== 429,
    [`get_by_id: under ${limit['subscriptions.get_by_id']}ms`]:                (r) => r.timings.duration < limit['subscriptions.get_by_id'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_id' });

  // GET /subscriptions?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsFilterRes = k6.http.get(`${base}/subscriptions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_by_filter'));
  k6.check(subsFilterRes, {
    'get_by_filter: not 5xx':                                                      (r) => r.status < 500,
    'get_by_filter: not 429':                                                      (r) => r.status !== 429,
    [`get_by_filter: under ${limit['subscriptions.get_by_filter']}ms`]:            (r) => r.timings.duration < limit['subscriptions.get_by_filter'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_filter' });

  // GET /subscriptions?search= — full-text search by subscription ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsSearchRes = k6.http.get(`${base}/subscriptions?search=${subscriptionId}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_by_search'));
  k6.check(subsSearchRes, {
    'get_by_search: not 5xx':                                                      (r) => r.status < 500,
    'get_by_search: not 429':                                                      (r) => r.status !== 429,
    [`get_by_search: under ${limit['subscriptions.get_by_search']}ms`]:            (r) => r.timings.duration < limit['subscriptions.get_by_search'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_search' });

  // ── CUSTOMERS (5 endpoints) ──────────────────────────────────────────────────

  // GET /customers — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusListRes = k6.http.get(`${base}/customers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('customers', 'customers.get_list'));
  k6.check(cusListRes, {
    'get_list: not 5xx':                                                 (r) => r.status < 500,
    'get_list: not 429':                                                 (r) => r.status !== 429,
    [`get_list: under ${limit['customers.get_list']}ms`]:                (r) => r.timings.duration < limit['customers.get_list'],
  }, { module: 'customers', ep: 'customers.get_list' });

  // GET /customers/:uid — single customer by UID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusByIdRes = k6.http.get(`${base}/customers/${customerId}`, params('customers', 'customers.get_by_id'));
  k6.check(cusByIdRes, {
    'get_by_id: not 5xx':                                                (r) => r.status < 500,
    'get_by_id: not 429':                                                (r) => r.status !== 429,
    [`get_by_id: under ${limit['customers.get_by_id']}ms`]:              (r) => r.timings.duration < limit['customers.get_by_id'],
  }, { module: 'customers', ep: 'customers.get_by_id' });

  // GET /customers/:uid/balance — wallet / credit balance
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusBalanceRes = k6.http.get(`${base}/customers/${customerId}/balance`, params('customers', 'customers.get_balance'));
  k6.check(cusBalanceRes, {
    'get_balance: not 5xx':                                              (r) => r.status < 500,
    'get_balance: not 429':                                              (r) => r.status !== 429,
    [`get_balance: under ${limit['customers.get_balance']}ms`]:          (r) => r.timings.duration < limit['customers.get_balance'],
  }, { module: 'customers', ep: 'customers.get_balance' });

  // GET /customers?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusFilterRes = k6.http.get(`${base}/customers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('customers', 'customers.get_by_filter'));
  k6.check(cusFilterRes, {
    'get_by_filter: not 5xx':                                                (r) => r.status < 500,
    'get_by_filter: not 429':                                                (r) => r.status !== 429,
    [`get_by_filter: under ${limit['customers.get_by_filter']}ms`]:          (r) => r.timings.duration < limit['customers.get_by_filter'],
  }, { module: 'customers', ep: 'customers.get_by_filter' });

  // GET /customers?search= — full-text search by customer UID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusSearchRes = k6.http.get(`${base}/customers?search=${customerId}&sort=created_at&desc=true`, params('customers', 'customers.get_by_search'));
  k6.check(cusSearchRes, {
    'get_by_search: not 5xx':                                                (r) => r.status < 500,
    'get_by_search: not 429':                                                (r) => r.status !== 429,
    [`get_by_search: under ${limit['customers.get_by_search']}ms`]:          (r) => r.timings.duration < limit['customers.get_by_search'],
  }, { module: 'customers', ep: 'customers.get_by_search' });

  // ── INVOICES (4 endpoints) ───────────────────────────────────────────────────

  // GET /paginated-invoices — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invListRes = k6.http.get(`${base}/paginated-invoices?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('invoices', 'invoices.get_list'));
  k6.check(invListRes, {
    'get_list: not 5xx':                                               (r) => r.status < 500,
    'get_list: not 429':                                               (r) => r.status !== 429,
    [`get_list: under ${limit['invoices.get_list']}ms`]:               (r) => r.timings.duration < limit['invoices.get_list'],
  }, { module: 'invoices', ep: 'invoices.get_list' });

  // GET /invoices/:invoice_number — single invoice by invoice number
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invByNumRes = k6.http.get(`${base}/invoices/${invoiceNumber}`, params('invoices', 'invoices.get_by_number'));
  k6.check(invByNumRes, {
    'get_by_number: not 5xx':                                              (r) => r.status < 500,
    'get_by_number: not 429':                                              (r) => r.status !== 429,
    [`get_by_number: under ${limit['invoices.get_by_number']}ms`]:         (r) => r.timings.duration < limit['invoices.get_by_number'],
  }, { module: 'invoices', ep: 'invoices.get_by_number' });

  // GET /paginated-invoices?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invFilterRes = k6.http.get(`${base}/paginated-invoices?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('invoices', 'invoices.get_by_filter'));
  k6.check(invFilterRes, {
    'get_by_filter: not 5xx':                                              (r) => r.status < 500,
    'get_by_filter: not 429':                                              (r) => r.status !== 429,
    [`get_by_filter: under ${limit['invoices.get_by_filter']}ms`]:         (r) => r.timings.duration < limit['invoices.get_by_filter'],
  }, { module: 'invoices', ep: 'invoices.get_by_filter' });

  // GET /paginated-invoices?search= — full-text search by invoice number
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invSearchRes = k6.http.get(`${base}/paginated-invoices?search=${invoiceNumber}&sort=created_at&desc=true`, params('invoices', 'invoices.get_by_search'));
  k6.check(invSearchRes, {
    'get_by_search: not 5xx':                                              (r) => r.status < 500,
    'get_by_search: not 429':                                              (r) => r.status !== 429,
    [`get_by_search: under ${limit['invoices.get_by_search']}ms`]:         (r) => r.timings.duration < limit['invoices.get_by_search'],
  }, { module: 'invoices', ep: 'invoices.get_by_search' });

  // ── TRANSACTIONS (4 endpoints) ───────────────────────────────────────────────

  // GET /transactions — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txListRes = k6.http.get(`${base}/transactions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('transactions', 'transactions.get_list'));
  k6.check(txListRes, {
    'get_list: not 5xx':                                                   (r) => r.status < 500,
    'get_list: not 429':                                                   (r) => r.status !== 429,
    [`get_list: under ${limit['transactions.get_list']}ms`]:               (r) => r.timings.duration < limit['transactions.get_list'],
  }, { module: 'transactions', ep: 'transactions.get_list' });

  // GET /transactions/:id — single transaction by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txByIdRes = k6.http.get(`${base}/transactions/${transactionId}`, params('transactions', 'transactions.get_by_id'));
  k6.check(txByIdRes, {
    'get_by_id: not 5xx':                                                  (r) => r.status < 500,
    'get_by_id: not 429':                                                  (r) => r.status !== 429,
    [`get_by_id: under ${limit['transactions.get_by_id']}ms`]:             (r) => r.timings.duration < limit['transactions.get_by_id'],
  }, { module: 'transactions', ep: 'transactions.get_by_id' });

  // GET /transactions?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txFilterRes = k6.http.get(`${base}/transactions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('transactions', 'transactions.get_by_filter'));
  k6.check(txFilterRes, {
    'get_by_filter: not 5xx':                                                  (r) => r.status < 500,
    'get_by_filter: not 429':                                                  (r) => r.status !== 429,
    [`get_by_filter: under ${limit['transactions.get_by_filter']}ms`]:         (r) => r.timings.duration < limit['transactions.get_by_filter'],
  }, { module: 'transactions', ep: 'transactions.get_by_filter' });

  // GET /transactions?search= — full-text search by transaction ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txSearchRes = k6.http.get(`${base}/transactions?search=${transactionId}&sort=created_at&desc=true`, params('transactions', 'transactions.get_by_search'));
  k6.check(txSearchRes, {
    'get_by_search: not 5xx':                                                  (r) => r.status < 500,
    'get_by_search: not 429':                                                  (r) => r.status !== 429,
    [`get_by_search: under ${limit['transactions.get_by_search']}ms`]:         (r) => r.timings.duration < limit['transactions.get_by_search'],
  }, { module: 'transactions', ep: 'transactions.get_by_search' });

  // ── DRAFT ORDERS (4 endpoints) ───────────────────────────────────────────────

  // GET /draft-orders — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doListRes = k6.http.get(`${base}/draft-orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_list'));
  k6.check(doListRes, {
    'get_list: not 5xx':                                                   (r) => r.status < 500,
    'get_list: not 429':                                                   (r) => r.status !== 429,
    [`get_list: under ${limit['draft_orders.get_list']}ms`]:               (r) => r.timings.duration < limit['draft_orders.get_list'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_list' });

  // GET /draft-orders/:id — single draft order by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doByIdRes = k6.http.get(`${base}/draft-orders/${draftOrderId}`, params('draft_orders', 'draft_orders.get_by_id'));
  k6.check(doByIdRes, {
    'get_by_id: not 5xx':                                                  (r) => r.status < 500,
    'get_by_id: not 429':                                                  (r) => r.status !== 429,
    [`get_by_id: under ${limit['draft_orders.get_by_id']}ms`]:             (r) => r.timings.duration < limit['draft_orders.get_by_id'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_id' });

  // GET /draft-orders?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doFilterRes = k6.http.get(`${base}/draft-orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_by_filter'));
  k6.check(doFilterRes, {
    'get_by_filter: not 5xx':                                                  (r) => r.status < 500,
    'get_by_filter: not 429':                                                  (r) => r.status !== 429,
    [`get_by_filter: under ${limit['draft_orders.get_by_filter']}ms`]:         (r) => r.timings.duration < limit['draft_orders.get_by_filter'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_filter' });

  // GET /draft-orders?search= — full-text search by draft order name
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doSearchRes = k6.http.get(`${base}/draft-orders?search=${encodeURIComponent(draftOrderName)}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_by_search'));
  k6.check(doSearchRes, {
    'get_by_search: not 5xx':                                                  (r) => r.status < 500,
    'get_by_search: not 429':                                                  (r) => r.status !== 429,
    [`get_by_search: under ${limit['draft_orders.get_by_search']}ms`]:         (r) => r.timings.duration < limit['draft_orders.get_by_search'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_search' });

  // ── RECURRING PAYMENTS (4 endpoints) ────────────────────────────────────────

  // GET /recurring-payments — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpListRes = k6.http.get(`${base}/recurring-payments?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_list'));
  k6.check(rpListRes, {
    'get_list: not 5xx':                                                       (r) => r.status < 500,
    'get_list: not 429':                                                       (r) => r.status !== 429,
    [`get_list: under ${limit['recurring_payments.get_list']}ms`]:             (r) => r.timings.duration < limit['recurring_payments.get_list'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_list' });

  // GET /recurring-payments/:id — single recurring payment by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpByIdRes = k6.http.get(`${base}/recurring-payments/${recurringPaymentId}`, params('recurring_payments', 'recurring_payments.get_by_id'));
  k6.check(rpByIdRes, {
    'get_by_id: not 5xx':                                                        (r) => r.status < 500,
    'get_by_id: not 429':                                                        (r) => r.status !== 429,
    [`get_by_id: under ${limit['recurring_payments.get_by_id']}ms`]:             (r) => r.timings.duration < limit['recurring_payments.get_by_id'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_id' });

  // GET /recurring-payments?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpFilterRes = k6.http.get(`${base}/recurring-payments?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_by_filter'));
  k6.check(rpFilterRes, {
    'get_by_filter: not 5xx':                                                        (r) => r.status < 500,
    'get_by_filter: not 429':                                                        (r) => r.status !== 429,
    [`get_by_filter: under ${limit['recurring_payments.get_by_filter']}ms`]:         (r) => r.timings.duration < limit['recurring_payments.get_by_filter'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_filter' });

  // GET /recurring-payments?search= — full-text search by subscription ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpSearchRes = k6.http.get(`${base}/recurring-payments?search=${recurringSubscriptionId}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_by_search'));
  k6.check(rpSearchRes, {
    'get_by_search: not 5xx':                                                        (r) => r.status < 500,
    'get_by_search: not 429':                                                        (r) => r.status !== 429,
    [`get_by_search: under ${limit['recurring_payments.get_by_search']}ms`]:         (r) => r.timings.duration < limit['recurring_payments.get_by_search'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_search' });

  // ── PRODUCTS (5 endpoints) ───────────────────────────────────────────────────

  // GET /products — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proListRes = k6.http.get(`${base}/products?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('products', 'products.get_list'));
  k6.check(proListRes, {
    'get_list: not 5xx':                                               (r) => r.status < 500,
    'get_list: not 429':                                               (r) => r.status !== 429,
    [`get_list: under ${limit['products.get_list']}ms`]:               (r) => r.timings.duration < limit['products.get_list'],
  }, { module: 'products', ep: 'products.get_list' });

  // GET /products/:id/variants — variants for a specific product
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proVariantsRes = k6.http.get(`${base}/products/${productId}/variants`, params('products', 'products.get_variants'));
  k6.check(proVariantsRes, {
    'get_variants: not 5xx':                                               (r) => r.status < 500,
    'get_variants: not 429':                                               (r) => r.status !== 429,
    [`get_variants: under ${limit['products.get_variants']}ms`]:           (r) => r.timings.duration < limit['products.get_variants'],
  }, { module: 'products', ep: 'products.get_variants' });

  // GET /products/variants — all variants across all products, paginated
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proAllVariantsRes = k6.http.get(`${base}/products/variants?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('products', 'products.get_all_variants'));
  k6.check(proAllVariantsRes, {
    'get_all_variants: not 5xx':                                               (r) => r.status < 500,
    'get_all_variants: not 429':                                               (r) => r.status !== 429,
    [`get_all_variants: under ${limit['products.get_all_variants']}ms`]:       (r) => r.timings.duration < limit['products.get_all_variants'],
  }, { module: 'products', ep: 'products.get_all_variants' });

  // GET /products?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proFilterRes = k6.http.get(`${base}/products?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('products', 'products.get_by_filter'));
  k6.check(proFilterRes, {
    'get_by_filter: not 5xx':                                              (r) => r.status < 500,
    'get_by_filter: not 429':                                              (r) => r.status !== 429,
    [`get_by_filter: under ${limit['products.get_by_filter']}ms`]:         (r) => r.timings.duration < limit['products.get_by_filter'],
  }, { module: 'products', ep: 'products.get_by_filter' });

  // GET /products?search= — full-text search by product title
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proSearchRes = k6.http.get(`${base}/products?search=${encodeURIComponent(productTitle)}&sort=created_at&desc=true`, params('products', 'products.get_by_search'));
  k6.check(proSearchRes, {
    'get_by_search: not 5xx':                                              (r) => r.status < 500,
    'get_by_search: not 429':                                              (r) => r.status !== 429,
    [`get_by_search: under ${limit['products.get_by_search']}ms`]:         (r) => r.timings.duration < limit['products.get_by_search'],
  }, { module: 'products', ep: 'products.get_by_search' });

  // ── RETAILERS (4 endpoints) ──────────────────────────────────────────────────

  // GET /retailers — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retListRes = k6.http.get(`${base}/retailers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('retailers', 'retailers.get_list'));
  k6.check(retListRes, {
    'get_list: not 5xx':                                                   (r) => r.status < 500,
    'get_list: not 429':                                                   (r) => r.status !== 429,
    [`get_list: under ${limit['retailers.get_list']}ms`]:                  (r) => r.timings.duration < limit['retailers.get_list'],
  }, { module: 'retailers', ep: 'retailers.get_list' });

  // GET /retailers/:location_id — single retailer by location ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retByLocRes = k6.http.get(`${base}/retailers/${locationId}`, params('retailers', 'retailers.get_by_location_id'));
  k6.check(retByLocRes, {
    'get_by_location_id: not 5xx':                                                     (r) => r.status < 500,
    'get_by_location_id: not 429':                                                     (r) => r.status !== 429,
    [`get_by_location_id: under ${limit['retailers.get_by_location_id']}ms`]:          (r) => r.timings.duration < limit['retailers.get_by_location_id'],
  }, { module: 'retailers', ep: 'retailers.get_by_location_id' });

  // GET /retailers?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retFilterRes = k6.http.get(`${base}/retailers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('retailers', 'retailers.get_by_filter'));
  k6.check(retFilterRes, {
    'get_by_filter: not 5xx':                                                  (r) => r.status < 500,
    'get_by_filter: not 429':                                                  (r) => r.status !== 429,
    [`get_by_filter: under ${limit['retailers.get_by_filter']}ms`]:            (r) => r.timings.duration < limit['retailers.get_by_filter'],
  }, { module: 'retailers', ep: 'retailers.get_by_filter' });

  // GET /retailers?search= — full-text search by retailer name
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retSearchRes = k6.http.get(`${base}/retailers?search=${encodeURIComponent(retailerName)}&sort=created_at&desc=true`, params('retailers', 'retailers.get_by_search'));
  k6.check(retSearchRes, {
    'get_by_search: not 5xx':                                                  (r) => r.status < 500,
    'get_by_search: not 429':                                                  (r) => r.status !== 429,
    [`get_by_search: under ${limit['retailers.get_by_search']}ms`]:            (r) => r.timings.duration < limit['retailers.get_by_search'],
  }, { module: 'retailers', ep: 'retailers.get_by_search' });

  // ── VOUCHERS (4 endpoints) ───────────────────────────────────────────────────

  // GET /vouchers — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouListRes = k6.http.get(`${base}/vouchers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_list'));
  k6.check(vouListRes, {
    'get_list: not 5xx':                                               (r) => r.status < 500,
    'get_list: not 429':                                               (r) => r.status !== 429,
    [`get_list: under ${limit['vouchers.get_list']}ms`]:               (r) => r.timings.duration < limit['vouchers.get_list'],
  }, { module: 'vouchers', ep: 'vouchers.get_list' });

  // GET /vouchers/:voucher_code — single voucher by code
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouByCodeRes = k6.http.get(`${base}/vouchers/${voucherCode}`, params('vouchers', 'vouchers.get_by_code'));
  k6.check(vouByCodeRes, {
    'get_by_code: not 5xx':                                               (r) => r.status < 500,
    'get_by_code: not 429':                                               (r) => r.status !== 429,
    [`get_by_code: under ${limit['vouchers.get_by_code']}ms`]:            (r) => r.timings.duration < limit['vouchers.get_by_code'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_code' });

  // GET /vouchers?filter — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouFilterRes = k6.http.get(`${base}/vouchers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_by_filter'));
  k6.check(vouFilterRes, {
    'get_by_filter: not 5xx':                                              (r) => r.status < 500,
    'get_by_filter: not 429':                                              (r) => r.status !== 429,
    [`get_by_filter: under ${limit['vouchers.get_by_filter']}ms`]:         (r) => r.timings.duration < limit['vouchers.get_by_filter'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_filter' });

  // GET /vouchers?search= — full-text search by voucher code
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouSearchRes = k6.http.get(`${base}/vouchers?search=${encodeURIComponent(voucherCode)}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_by_search'));
  k6.check(vouSearchRes, {
    'get_by_search: not 5xx':                                              (r) => r.status < 500,
    'get_by_search: not 429':                                              (r) => r.status !== 429,
    [`get_by_search: under ${limit['vouchers.get_by_search']}ms`]:         (r) => r.timings.duration < limit['vouchers.get_by_search'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_search' });
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
export function teardown(data) {
  console.log('[spike] Run complete. Check for HTTP 429 / 503 — WAF or rate-limit may have triggered.');
  console.log(`[spike] companyId: ${data.companyId}`);
}

// ─── Report config ────────────────────────────────────────────────────────────
const REPORT_CONFIG = {
  title:    'All Modules Spike Test Report',
  subtitle: '500 VUs · 50s · 44 endpoints',
  module:   'spike',
  endpoints: ENDPOINTS.map(({ tag, p95 }) => ({
    tag,
    label: {
      'orders.get_list':                'GET /orders (list)',
      'orders.get_by_id':               'GET /orders/:id',
      'orders.get_payment_update_link': 'GET /orders/:id/payment-update-link',
      'orders.get_payment_methods':     'GET /orders/:id/payment-methods',
      'orders.get_by_filter':           'GET /orders (filter)',
      'orders.get_by_search':           'GET /orders?search=:id',

      'subscriptions.get_list':         'GET /subscriptions (list)',
      'subscriptions.get_by_id':        'GET /subscriptions/:id',
      'subscriptions.get_by_filter':    'GET /subscriptions (filter)',
      'subscriptions.get_by_search':    'GET /subscriptions?search=:id',

      'customers.get_list':             'GET /customers (list)',
      'customers.get_by_id':            'GET /customers/:uid',
      'customers.get_balance':          'GET /customers/:uid/balance',
      'customers.get_by_filter':        'GET /customers (filter)',
      'customers.get_by_search':        'GET /customers?search=:uid',

      'invoices.get_list':              'GET /paginated-invoices (list)',
      'invoices.get_by_number':         'GET /invoices/:invoice_number',
      'invoices.get_by_filter':         'GET /paginated-invoices (filter)',
      'invoices.get_by_search':         'GET /paginated-invoices?search=:invoice_number',

      'transactions.get_list':          'GET /transactions (list)',
      'transactions.get_by_id':         'GET /transactions/:id',
      'transactions.get_by_filter':     'GET /transactions (filter)',
      'transactions.get_by_search':     'GET /transactions?search=:id',

      'draft_orders.get_list':          'GET /draft-orders (list)',
      'draft_orders.get_by_id':         'GET /draft-orders/:id',
      'draft_orders.get_by_filter':     'GET /draft-orders (filter)',
      'draft_orders.get_by_search':     'GET /draft-orders?search=:name',

      'recurring_payments.get_list':      'GET /recurring-payments (list)',
      'recurring_payments.get_by_id':     'GET /recurring-payments/:id',
      'recurring_payments.get_by_filter': 'GET /recurring-payments (filter)',
      'recurring_payments.get_by_search': 'GET /recurring-payments?search=:subscription_id',

      'products.get_list':              'GET /products (list)',
      'products.get_variants':          'GET /products/:id/variants',
      'products.get_all_variants':      'GET /products/variants (all)',
      'products.get_by_filter':         'GET /products (filter)',
      'products.get_by_search':         'GET /products?search=:title',

      'retailers.get_list':             'GET /retailers (list)',
      'retailers.get_by_location_id':   'GET /retailers/:location_id',
      'retailers.get_by_filter':        'GET /retailers (filter)',
      'retailers.get_by_search':        'GET /retailers?search=:name',

      'vouchers.get_list':              'GET /vouchers (list)',
      'vouchers.get_by_code':           'GET /vouchers/:voucher_code',
      'vouchers.get_by_filter':         'GET /vouchers (filter)',
      'vouchers.get_by_search':         'GET /vouchers?search=:voucher_code',
    }[tag],
    p95limit: p95,
  })),
};

export function handleSummary(data) {
  return {
    'tests/spike/reports/all-modules-spike-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
