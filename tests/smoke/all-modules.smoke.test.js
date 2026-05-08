/**
 * Smoke test — All modules combined (44 GET endpoints)
 *
 * Purpose : Validate the script works, auth succeeds, every endpoint responds
 *           with HTTP 200, and response shape is correct.  Not a performance test.
 *
 * Strategy: 1 VU × 1 iteration (shared-iterations).  All 44 endpoints run exactly
 *           once in sequence.  Zero errors allowed; 99%+ check pass rate required.
 *
 * VU profile:
 *   1 VU × 1 iteration — no ramp, no concurrency
 *   Maximum duration cap: 5 min (44 endpoints × ~1s each ≈ 90s typical)
 *
 * Modules covered:
 *   Orders              (6 endpoints)
 *   Subscriptions       (4 endpoints)
 *   Customers           (5 endpoints)
 *   Invoices            (4 endpoints)
 *   Transactions        (4 endpoints)
 *   Draft Orders        (4 endpoints)
 *   Recurring Payments  (4 endpoints)
 *   Products            (5 endpoints)
 *   Retailers           (4 endpoints)
 *   Vouchers            (4 endpoints)
 *
 * Total: 44 endpoints · ~2 min max duration
 *
 * Run: npm run all:smoke
 */

// ─── Imports ─────────────────────────────────────────────────────────────────
import * as k6 from '../support/helpers/k6.js';
import { getToken, setupAuth } from '../support/helpers/auth.js';
import { buildHtmlReport } from '../support/helpers/report.js';
import { buildThresholds } from '../support/helpers/thresholds.js';
import { fetchAllIds } from '../support/helpers/setup.js';
import { makeParams } from '../support/helpers/apiClient.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const SLEEP_BETWEEN_REQUESTS = 0.5; // seconds — short pacing; smoke completes in ~2 min
const PER_PAGE = 10; // smoke uses small pages — connectivity check, not throughput test

// ─── Endpoint definitions ─────────────────────────────────────────────────────
// Uniform p95/p90 across all endpoints — smoke is a connectivity gate,
// not a performance benchmark.  p95 = 2500ms, p90 = 2300ms for all.
const ENDPOINTS = [
  // Orders
  { tag: 'orders.get_list',                p95: 2500, p90: 2300 },
  { tag: 'orders.get_by_id',               p95: 2500, p90: 2300 },
  { tag: 'orders.get_payment_update_link', p95: 2500, p90: 2300 },
  { tag: 'orders.get_payment_methods',     p95: 2500, p90: 2300 },
  { tag: 'orders.get_by_filter',           p95: 2500, p90: 2300 },
  { tag: 'orders.get_by_search',           p95: 2500, p90: 2300 },

  // Subscriptions
  { tag: 'subscriptions.get_list',         p95: 2500, p90: 2300 },
  { tag: 'subscriptions.get_by_id',        p95: 2500, p90: 2300 },
  { tag: 'subscriptions.get_by_filter',    p95: 2500, p90: 2300 },
  { tag: 'subscriptions.get_by_search',    p95: 2500, p90: 2300 },

  // Customers
  { tag: 'customers.get_list',             p95: 2500, p90: 2300 },
  { tag: 'customers.get_by_id',            p95: 2500, p90: 2300 },
  { tag: 'customers.get_balance',          p95: 2500, p90: 2300 },
  { tag: 'customers.get_by_filter',        p95: 2500, p90: 2300 },
  { tag: 'customers.get_by_search',        p95: 2500, p90: 2300 },

  // Invoices
  { tag: 'invoices.get_list',              p95: 2500, p90: 2300 },
  { tag: 'invoices.get_by_number',         p95: 2500, p90: 2300 },
  { tag: 'invoices.get_by_filter',         p95: 2500, p90: 2300 },
  { tag: 'invoices.get_by_search',         p95: 2500, p90: 2300 },

  // Transactions
  { tag: 'transactions.get_list',          p95: 2500, p90: 2300 },
  { tag: 'transactions.get_by_id',         p95: 2500, p90: 2300 },
  { tag: 'transactions.get_by_filter',     p95: 2500, p90: 2300 },
  { tag: 'transactions.get_by_search',     p95: 2500, p90: 2300 },

  // Draft Orders
  { tag: 'draft_orders.get_list',          p95: 2500, p90: 2300 },
  { tag: 'draft_orders.get_by_id',         p95: 2500, p90: 2300 },
  { tag: 'draft_orders.get_by_filter',     p95: 2500, p90: 2300 },
  { tag: 'draft_orders.get_by_search',     p95: 2500, p90: 2300 },

  // Recurring Payments
  { tag: 'recurring_payments.get_list',      p95: 2500, p90: 2300 },
  { tag: 'recurring_payments.get_by_id',     p95: 2500, p90: 2300 },
  { tag: 'recurring_payments.get_by_filter', p95: 2500, p90: 2300 },
  { tag: 'recurring_payments.get_by_search', p95: 2500, p90: 2300 },

  // Products
  { tag: 'products.get_list',              p95: 2500, p90: 2300 },
  { tag: 'products.get_variants',          p95: 2500, p90: 2300 },
  { tag: 'products.get_all_variants',      p95: 2500, p90: 2300 },
  { tag: 'products.get_by_filter',         p95: 2500, p90: 2300 },
  { tag: 'products.get_by_search',         p95: 2500, p90: 2300 },

  // Retailers
  { tag: 'retailers.get_list',             p95: 2500, p90: 2300 },
  { tag: 'retailers.get_by_location_id',   p95: 2500, p90: 2300 },
  { tag: 'retailers.get_by_filter',        p95: 2500, p90: 2300 },
  { tag: 'retailers.get_by_search',        p95: 2500, p90: 2300 },

  // Vouchers
  { tag: 'vouchers.get_list',              p95: 2500, p90: 2300 },
  { tag: 'vouchers.get_by_code',           p95: 2500, p90: 2300 },
  { tag: 'vouchers.get_by_filter',         p95: 2500, p90: 2300 },
  { tag: 'vouchers.get_by_search',         p95: 2500, p90: 2300 },
];

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Smoke overrides: near-zero HTTP errors, 99%+ check pass rate per endpoint.
const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

const baseThresholds = buildThresholds('smoke', ENDPOINTS);
const smokeChecksOverrides = Object.fromEntries(
  ENDPOINTS.map(({ tag }) => [`checks{ep:${tag}}`, ['rate>0.99']])
);

// ─── Scenario options ─────────────────────────────────────────────────────────
export const options = {
  cloud: k6.cloudConfig('All Modules Smoke'),
  summaryTrendStats: k6.SUMMARY_TREND_STATS,
  thresholds: {
    ...baseThresholds,
    http_req_failed:                 ['rate<0.005'],  // near-zero errors in smoke
    'http_req_failed{module:smoke}': ['rate<0.005'],
    'http_reqs{module:smoke}':       ['rate>=0'],     // no requests tagged module:smoke
    ...smokeChecksOverrides,
  },
  scenarios: {
    smoke: {
      executor:    'shared-iterations',
      vus:         1,
      iterations:  1,           // run the full suite exactly once
      maxDuration: '5m',        // safety cap — 44 endpoints × ~1s each ≈ 90s
      tags: { scenario: 'smoke' },
    },
  },
};

// ─── Setup — fetch one real ID per module ─────────────────────────────────────
export function setup() {
  const { token, companyId } = setupAuth();
  return fetchAllIds(token, companyId);
}

// ─── Default — 1 VU runs all 44 endpoints once ────────────────────────────────
export default function (data) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}`;

  const {
    orderId, subscriptionId, customerId, invoiceNumber,
    transactionId, draftOrderId, draftOrderName,
    recurringPaymentId, recurringSubscriptionId,
    productId, productTitle, locationId, retailerName, voucherCode,
  } = data;

  const params = makeParams(token, 'smoke', '15s');

  // ── ORDERS (6 endpoints) ─────────────────────────────────────────────────────

  // GET /orders — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersListRes = k6.http.get(`${base}/orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('orders', 'orders.get_list'));
  k6.check(ordersListRes, {
    'orders.get_list: status 200':                              (r) => r.status === 200,
    'orders.get_list: has data array':                          (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`orders.get_list: under ${limit['orders.get_list']}ms`]:   (r) => r.timings.duration < limit['orders.get_list'],
  }, { module: 'orders', ep: 'orders.get_list' });

  // GET /orders/:id — single order by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderByIdRes = k6.http.get(`${base}/orders/${orderId}`, params('orders', 'orders.get_by_id'));
  k6.check(orderByIdRes, {
    'orders.get_by_id: status 200':                             (r) => r.status === 200,
    'orders.get_by_id: has id':                                 (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`orders.get_by_id: under ${limit['orders.get_by_id']}ms`]: (r) => r.timings.duration < limit['orders.get_by_id'],
  }, { module: 'orders', ep: 'orders.get_by_id' });

  // GET /orders/:id/payment-update-link — link to update the order's payment method
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderLinkRes = k6.http.get(`${base}/orders/${orderId}/payment-update-link`, params('orders', 'orders.get_payment_update_link'));
  k6.check(orderLinkRes, {
    'orders.get_payment_update_link: status 200':                                           (r) => r.status === 200,
    [`orders.get_payment_update_link: under ${limit['orders.get_payment_update_link']}ms`]: (r) => r.timings.duration < limit['orders.get_payment_update_link'],
  }, { module: 'orders', ep: 'orders.get_payment_update_link' });

  // GET /orders/:id/payment-methods — available payment methods for the order
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderMethodsRes = k6.http.get(`${base}/orders/${orderId}/payment-methods`, params('orders', 'orders.get_payment_methods'));
  k6.check(orderMethodsRes, {
    'orders.get_payment_methods: status 200':                                       (r) => r.status === 200,
    [`orders.get_payment_methods: under ${limit['orders.get_payment_methods']}ms`]: (r) => r.timings.duration < limit['orders.get_payment_methods'],
  }, { module: 'orders', ep: 'orders.get_payment_methods' });

  // GET /orders?sort=...&per_page=N — filtered list using query params
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersFilterRes = k6.http.get(`${base}/orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('orders', 'orders.get_by_filter'));
  k6.check(ordersFilterRes, {
    'orders.get_by_filter: status 200':                                 (r) => r.status === 200,
    'orders.get_by_filter: has data array':                             (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`orders.get_by_filter: under ${limit['orders.get_by_filter']}ms`]: (r) => r.timings.duration < limit['orders.get_by_filter'],
  }, { module: 'orders', ep: 'orders.get_by_filter' });

  // GET /orders?search=:id — full-text search by order ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersSearchRes = k6.http.get(`${base}/orders?search=${orderId}&sort=created_at&desc=true`, params('orders', 'orders.get_by_search'));
  k6.check(ordersSearchRes, {
    'orders.get_by_search: status 200':                                 (r) => r.status === 200,
    'orders.get_by_search: has data array':                             (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`orders.get_by_search: under ${limit['orders.get_by_search']}ms`]: (r) => r.timings.duration < limit['orders.get_by_search'],
  }, { module: 'orders', ep: 'orders.get_by_search' });

  // ── SUBSCRIPTIONS (4 endpoints) ───────────────────────────────────────────────

  // GET /subscriptions — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsListRes = k6.http.get(`${base}/subscriptions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_list'));
  k6.check(subsListRes, {
    'subscriptions.get_list: status 200':                                    (r) => r.status === 200,
    'subscriptions.get_list: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`subscriptions.get_list: under ${limit['subscriptions.get_list']}ms`]:  (r) => r.timings.duration < limit['subscriptions.get_list'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_list' });

  // GET /subscriptions/:id — single subscription by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subByIdRes = k6.http.get(`${base}/subscriptions/${subscriptionId}`, params('subscriptions', 'subscriptions.get_by_id'));
  k6.check(subByIdRes, {
    'subscriptions.get_by_id: status 200':                                   (r) => r.status === 200,
    'subscriptions.get_by_id: has id':                                       (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`subscriptions.get_by_id: under ${limit['subscriptions.get_by_id']}ms`]:(r) => r.timings.duration < limit['subscriptions.get_by_id'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_id' });

  // GET /subscriptions?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsFilterRes = k6.http.get(`${base}/subscriptions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_by_filter'));
  k6.check(subsFilterRes, {
    'subscriptions.get_by_filter: status 200':                                         (r) => r.status === 200,
    'subscriptions.get_by_filter: has data array':                                     (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`subscriptions.get_by_filter: under ${limit['subscriptions.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['subscriptions.get_by_filter'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_filter' });

  // GET /subscriptions?search=:id — full-text search by subscription ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsSearchRes = k6.http.get(`${base}/subscriptions?search=${subscriptionId}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_by_search'));
  k6.check(subsSearchRes, {
    'subscriptions.get_by_search: status 200':                                         (r) => r.status === 200,
    'subscriptions.get_by_search: has data array':                                     (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`subscriptions.get_by_search: under ${limit['subscriptions.get_by_search']}ms`]:  (r) => r.timings.duration < limit['subscriptions.get_by_search'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_search' });

  // ── CUSTOMERS (5 endpoints) ───────────────────────────────────────────────────

  // GET /customers — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusListRes = k6.http.get(`${base}/customers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('customers', 'customers.get_list'));
  k6.check(cusListRes, {
    'customers.get_list: status 200':                                  (r) => r.status === 200,
    'customers.get_list: has data array':                              (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`customers.get_list: under ${limit['customers.get_list']}ms`]:    (r) => r.timings.duration < limit['customers.get_list'],
  }, { module: 'customers', ep: 'customers.get_list' });

  // GET /customers/:uid — single customer by UID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusByIdRes = k6.http.get(`${base}/customers/${customerId}`, params('customers', 'customers.get_by_id'));
  k6.check(cusByIdRes, {
    'customers.get_by_id: status 200':                                 (r) => r.status === 200,
    'customers.get_by_id: has id':                                     (r) => { try { const b = JSON.parse(r.body); return !!(b.uid || b.id); } catch { return false; } },
    [`customers.get_by_id: under ${limit['customers.get_by_id']}ms`]:  (r) => r.timings.duration < limit['customers.get_by_id'],
  }, { module: 'customers', ep: 'customers.get_by_id' });

  // GET /customers/:uid/balance — customer wallet balance (remaining_amount)
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusBalanceRes = k6.http.get(`${base}/customers/${customerId}/balance`, params('customers', 'customers.get_balance'));
  k6.check(cusBalanceRes, {
    'customers.get_balance: status 200':                                   (r) => r.status === 200,
    'customers.get_balance: has remaining_amount':                         (r) => { try { return 'remaining_amount' in JSON.parse(r.body); } catch { return false; } },
    [`customers.get_balance: under ${limit['customers.get_balance']}ms`]:  (r) => r.timings.duration < limit['customers.get_balance'],
  }, { module: 'customers', ep: 'customers.get_balance' });

  // GET /customers?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusFilterRes = k6.http.get(`${base}/customers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('customers', 'customers.get_by_filter'));
  k6.check(cusFilterRes, {
    'customers.get_by_filter: status 200':                                    (r) => r.status === 200,
    'customers.get_by_filter: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`customers.get_by_filter: under ${limit['customers.get_by_filter']}ms`]: (r) => r.timings.duration < limit['customers.get_by_filter'],
  }, { module: 'customers', ep: 'customers.get_by_filter' });

  // GET /customers?search=:uid — full-text search by customer UID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusSearchRes = k6.http.get(`${base}/customers?search=${customerId}&sort=created_at&desc=true`, params('customers', 'customers.get_by_search'));
  k6.check(cusSearchRes, {
    'customers.get_by_search: status 200':                                    (r) => r.status === 200,
    'customers.get_by_search: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`customers.get_by_search: under ${limit['customers.get_by_search']}ms`]: (r) => r.timings.duration < limit['customers.get_by_search'],
  }, { module: 'customers', ep: 'customers.get_by_search' });

  // ── INVOICES (4 endpoints) ────────────────────────────────────────────────────

  // GET /paginated-invoices — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invListRes = k6.http.get(`${base}/paginated-invoices?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('invoices', 'invoices.get_list'));
  k6.check(invListRes, {
    'invoices.get_list: status 200':                                 (r) => r.status === 200,
    'invoices.get_list: has data array':                             (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`invoices.get_list: under ${limit['invoices.get_list']}ms`]:    (r) => r.timings.duration < limit['invoices.get_list'],
  }, { module: 'invoices', ep: 'invoices.get_list' });

  // GET /invoices/:invoice_number — single invoice by invoice number
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invByNumRes = k6.http.get(`${base}/invoices/${invoiceNumber}`, params('invoices', 'invoices.get_by_number'));
  k6.check(invByNumRes, {
    'invoices.get_by_number: status 200':                                    (r) => r.status === 200,
    'invoices.get_by_number: has invoice_number':                            (r) => { try { const b = JSON.parse(r.body); return !!(b.invoice_number || b.number || b.id); } catch { return false; } },
    [`invoices.get_by_number: under ${limit['invoices.get_by_number']}ms`]:  (r) => r.timings.duration < limit['invoices.get_by_number'],
  }, { module: 'invoices', ep: 'invoices.get_by_number' });

  // GET /paginated-invoices?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invFilterRes = k6.http.get(`${base}/paginated-invoices?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('invoices', 'invoices.get_by_filter'));
  k6.check(invFilterRes, {
    'invoices.get_by_filter: status 200':                                    (r) => r.status === 200,
    'invoices.get_by_filter: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`invoices.get_by_filter: under ${limit['invoices.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['invoices.get_by_filter'],
  }, { module: 'invoices', ep: 'invoices.get_by_filter' });

  // GET /paginated-invoices?search=:invoice_number — full-text search
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invSearchRes = k6.http.get(`${base}/paginated-invoices?search=${invoiceNumber}&sort=created_at&desc=true`, params('invoices', 'invoices.get_by_search'));
  k6.check(invSearchRes, {
    'invoices.get_by_search: status 200':                                    (r) => r.status === 200,
    'invoices.get_by_search: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`invoices.get_by_search: under ${limit['invoices.get_by_search']}ms`]:  (r) => r.timings.duration < limit['invoices.get_by_search'],
  }, { module: 'invoices', ep: 'invoices.get_by_search' });

  // ── TRANSACTIONS (4 endpoints) ────────────────────────────────────────────────

  // GET /transactions — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txListRes = k6.http.get(`${base}/transactions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('transactions', 'transactions.get_list'));
  k6.check(txListRes, {
    'transactions.get_list: status 200':                                   (r) => r.status === 200,
    'transactions.get_list: has data array':                               (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`transactions.get_list: under ${limit['transactions.get_list']}ms`]:  (r) => r.timings.duration < limit['transactions.get_list'],
  }, { module: 'transactions', ep: 'transactions.get_list' });

  // GET /transactions/:id — single transaction by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txByIdRes = k6.http.get(`${base}/transactions/${transactionId}`, params('transactions', 'transactions.get_by_id'));
  k6.check(txByIdRes, {
    'transactions.get_by_id: status 200':                                  (r) => r.status === 200,
    'transactions.get_by_id: has id':                                      (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`transactions.get_by_id: under ${limit['transactions.get_by_id']}ms`]:(r) => r.timings.duration < limit['transactions.get_by_id'],
  }, { module: 'transactions', ep: 'transactions.get_by_id' });

  // GET /transactions?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txFilterRes = k6.http.get(`${base}/transactions?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('transactions', 'transactions.get_by_filter'));
  k6.check(txFilterRes, {
    'transactions.get_by_filter: status 200':                                       (r) => r.status === 200,
    'transactions.get_by_filter: has data array':                                   (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`transactions.get_by_filter: under ${limit['transactions.get_by_filter']}ms`]: (r) => r.timings.duration < limit['transactions.get_by_filter'],
  }, { module: 'transactions', ep: 'transactions.get_by_filter' });

  // GET /transactions?search=:id — full-text search by transaction ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txSearchRes = k6.http.get(`${base}/transactions?search=${transactionId}&sort=created_at&desc=true`, params('transactions', 'transactions.get_by_search'));
  k6.check(txSearchRes, {
    'transactions.get_by_search: status 200':                                       (r) => r.status === 200,
    'transactions.get_by_search: has data array':                                   (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`transactions.get_by_search: under ${limit['transactions.get_by_search']}ms`]: (r) => r.timings.duration < limit['transactions.get_by_search'],
  }, { module: 'transactions', ep: 'transactions.get_by_search' });

  // ── DRAFT ORDERS (4 endpoints) ────────────────────────────────────────────────

  // GET /draft-orders — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doListRes = k6.http.get(`${base}/draft-orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_list'));
  k6.check(doListRes, {
    'draft_orders.get_list: status 200':                                     (r) => r.status === 200,
    'draft_orders.get_list: has data array':                                 (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`draft_orders.get_list: under ${limit['draft_orders.get_list']}ms`]:    (r) => r.timings.duration < limit['draft_orders.get_list'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_list' });

  // GET /draft-orders/:id — single draft order by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doByIdRes = k6.http.get(`${base}/draft-orders/${draftOrderId}`, params('draft_orders', 'draft_orders.get_by_id'));
  k6.check(doByIdRes, {
    'draft_orders.get_by_id: status 200':                                    (r) => r.status === 200,
    'draft_orders.get_by_id: has id':                                        (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`draft_orders.get_by_id: under ${limit['draft_orders.get_by_id']}ms`]:  (r) => r.timings.duration < limit['draft_orders.get_by_id'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_id' });

  // GET /draft-orders?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doFilterRes = k6.http.get(`${base}/draft-orders?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_by_filter'));
  k6.check(doFilterRes, {
    'draft_orders.get_by_filter: status 200':                                        (r) => r.status === 200,
    'draft_orders.get_by_filter: has data array':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`draft_orders.get_by_filter: under ${limit['draft_orders.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['draft_orders.get_by_filter'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_filter' });

  // GET /draft-orders?search=:name — full-text search by draft order name
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doSearchRes = k6.http.get(`${base}/draft-orders?search=${encodeURIComponent(draftOrderName)}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_by_search'));
  k6.check(doSearchRes, {
    'draft_orders.get_by_search: status 200':                                        (r) => r.status === 200,
    'draft_orders.get_by_search: has data array':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`draft_orders.get_by_search: under ${limit['draft_orders.get_by_search']}ms`]:  (r) => r.timings.duration < limit['draft_orders.get_by_search'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_search' });

  // ── RECURRING PAYMENTS (4 endpoints) ──────────────────────────────────────────

  // GET /recurring-payments — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpListRes = k6.http.get(`${base}/recurring-payments?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_list'));
  k6.check(rpListRes, {
    'recurring_payments.get_list: status 200':                                        (r) => r.status === 200,
    'recurring_payments.get_list: has data array':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`recurring_payments.get_list: under ${limit['recurring_payments.get_list']}ms`]: (r) => r.timings.duration < limit['recurring_payments.get_list'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_list' });

  // GET /recurring-payments/:id — single recurring payment by ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpByIdRes = k6.http.get(`${base}/recurring-payments/${recurringPaymentId}`, params('recurring_payments', 'recurring_payments.get_by_id'));
  k6.check(rpByIdRes, {
    'recurring_payments.get_by_id: status 200':                                         (r) => r.status === 200,
    'recurring_payments.get_by_id: has id':                                             (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`recurring_payments.get_by_id: under ${limit['recurring_payments.get_by_id']}ms`]: (r) => r.timings.duration < limit['recurring_payments.get_by_id'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_id' });

  // GET /recurring-payments?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpFilterRes = k6.http.get(`${base}/recurring-payments?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_by_filter'));
  k6.check(rpFilterRes, {
    'recurring_payments.get_by_filter: status 200':                                            (r) => r.status === 200,
    'recurring_payments.get_by_filter: has data array':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`recurring_payments.get_by_filter: under ${limit['recurring_payments.get_by_filter']}ms`]:(r) => r.timings.duration < limit['recurring_payments.get_by_filter'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_filter' });

  // GET /recurring-payments?search=:subscription_id — search by linked subscription
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpSearchRes = k6.http.get(`${base}/recurring-payments?search=${recurringSubscriptionId}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_by_search'));
  k6.check(rpSearchRes, {
    'recurring_payments.get_by_search: status 200':                                            (r) => r.status === 200,
    'recurring_payments.get_by_search: has data array':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`recurring_payments.get_by_search: under ${limit['recurring_payments.get_by_search']}ms`]:(r) => r.timings.duration < limit['recurring_payments.get_by_search'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_search' });

  // ── PRODUCTS (5 endpoints) ────────────────────────────────────────────────────

  // GET /products — paginated product list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proListRes = k6.http.get(`${base}/products?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('products', 'products.get_list'));
  k6.check(proListRes, {
    'products.get_list: status 200':                                  (r) => r.status === 200,
    'products.get_list: has data array':                              (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`products.get_list: under ${limit['products.get_list']}ms`]:     (r) => r.timings.duration < limit['products.get_list'],
  }, { module: 'products', ep: 'products.get_list' });

  // GET /products/:id/variants — variants for one specific product
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proVariantsRes = k6.http.get(`${base}/products/${productId}/variants`, params('products', 'products.get_variants'));
  k6.check(proVariantsRes, {
    'products.get_variants: status 200':                                  (r) => r.status === 200,
    'products.get_variants: has data':                                    (r) => { try { const b = JSON.parse(r.body); return Array.isArray(b.data || b); } catch { return false; } },
    [`products.get_variants: under ${limit['products.get_variants']}ms`]: (r) => r.timings.duration < limit['products.get_variants'],
  }, { module: 'products', ep: 'products.get_variants' });

  // GET /products/variants — all variants across all products
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proAllVariantsRes = k6.http.get(`${base}/products/variants?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('products', 'products.get_all_variants'));
  k6.check(proAllVariantsRes, {
    'products.get_all_variants: status 200':                                      (r) => r.status === 200,
    'products.get_all_variants: has data array':                                  (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`products.get_all_variants: under ${limit['products.get_all_variants']}ms`]: (r) => r.timings.duration < limit['products.get_all_variants'],
  }, { module: 'products', ep: 'products.get_all_variants' });

  // GET /products?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proFilterRes = k6.http.get(`${base}/products?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('products', 'products.get_by_filter'));
  k6.check(proFilterRes, {
    'products.get_by_filter: status 200':                                    (r) => r.status === 200,
    'products.get_by_filter: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`products.get_by_filter: under ${limit['products.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['products.get_by_filter'],
  }, { module: 'products', ep: 'products.get_by_filter' });

  // GET /products?search=:title — full-text search by product title
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proSearchRes = k6.http.get(`${base}/products?search=${encodeURIComponent(productTitle)}&sort=created_at&desc=true`, params('products', 'products.get_by_search'));
  k6.check(proSearchRes, {
    'products.get_by_search: status 200':                                    (r) => r.status === 200,
    'products.get_by_search: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`products.get_by_search: under ${limit['products.get_by_search']}ms`]:  (r) => r.timings.duration < limit['products.get_by_search'],
  }, { module: 'products', ep: 'products.get_by_search' });

  // ── RETAILERS (4 endpoints) ───────────────────────────────────────────────────

  // GET /retailers — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retListRes = k6.http.get(`${base}/retailers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('retailers', 'retailers.get_list'));
  k6.check(retListRes, {
    'retailers.get_list: status 200':                                    (r) => r.status === 200,
    'retailers.get_list: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`retailers.get_list: under ${limit['retailers.get_list']}ms`]:      (r) => r.timings.duration < limit['retailers.get_list'],
  }, { module: 'retailers', ep: 'retailers.get_list' });

  // GET /retailers/:location_id — single retailer by location ID
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retByLocRes = k6.http.get(`${base}/retailers/${locationId}`, params('retailers', 'retailers.get_by_location_id'));
  k6.check(retByLocRes, {
    'retailers.get_by_location_id: status 200':                                         (r) => r.status === 200,
    'retailers.get_by_location_id: has id':                                             (r) => { try { const b = JSON.parse(r.body); return !!(b.location_id || b.id); } catch { return false; } },
    [`retailers.get_by_location_id: under ${limit['retailers.get_by_location_id']}ms`]: (r) => r.timings.duration < limit['retailers.get_by_location_id'],
  }, { module: 'retailers', ep: 'retailers.get_by_location_id' });

  // GET /retailers?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retFilterRes = k6.http.get(`${base}/retailers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('retailers', 'retailers.get_by_filter'));
  k6.check(retFilterRes, {
    'retailers.get_by_filter: status 200':                                     (r) => r.status === 200,
    'retailers.get_by_filter: has data array':                                 (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`retailers.get_by_filter: under ${limit['retailers.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['retailers.get_by_filter'],
  }, { module: 'retailers', ep: 'retailers.get_by_filter' });

  // GET /retailers?search=:name — full-text search by retailer name
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retSearchRes = k6.http.get(`${base}/retailers?search=${encodeURIComponent(retailerName)}&sort=created_at&desc=true`, params('retailers', 'retailers.get_by_search'));
  k6.check(retSearchRes, {
    'retailers.get_by_search: status 200':                                     (r) => r.status === 200,
    'retailers.get_by_search: has data array':                                 (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`retailers.get_by_search: under ${limit['retailers.get_by_search']}ms`]:  (r) => r.timings.duration < limit['retailers.get_by_search'],
  }, { module: 'retailers', ep: 'retailers.get_by_search' });

  // ── VOUCHERS (4 endpoints) ────────────────────────────────────────────────────

  // GET /vouchers — paginated list, newest first
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouListRes = k6.http.get(`${base}/vouchers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_list'));
  k6.check(vouListRes, {
    'vouchers.get_list: status 200':                                  (r) => r.status === 200,
    'vouchers.get_list: has data array':                              (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`vouchers.get_list: under ${limit['vouchers.get_list']}ms`]:     (r) => r.timings.duration < limit['vouchers.get_list'],
  }, { module: 'vouchers', ep: 'vouchers.get_list' });

  // GET /vouchers/:code — single voucher by voucher code
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouByCodeRes = k6.http.get(`${base}/vouchers/${voucherCode}`, params('vouchers', 'vouchers.get_by_code'));
  k6.check(vouByCodeRes, {
    'vouchers.get_by_code: status 200':                                    (r) => r.status === 200,
    'vouchers.get_by_code: has voucher_code':                              (r) => { try { const b = JSON.parse(r.body); return !!(b.voucher_code || b.code || b.id); } catch { return false; } },
    [`vouchers.get_by_code: under ${limit['vouchers.get_by_code']}ms`]:    (r) => r.timings.duration < limit['vouchers.get_by_code'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_code' });

  // GET /vouchers?sort=...&per_page=N — filtered list
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouFilterRes = k6.http.get(`${base}/vouchers?page=1&per_page=${PER_PAGE}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_by_filter'));
  k6.check(vouFilterRes, {
    'vouchers.get_by_filter: status 200':                                    (r) => r.status === 200,
    'vouchers.get_by_filter: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`vouchers.get_by_filter: under ${limit['vouchers.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['vouchers.get_by_filter'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_filter' });

  // GET /vouchers?search=:code — full-text search by voucher code
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouSearchRes = k6.http.get(`${base}/vouchers?search=${encodeURIComponent(voucherCode)}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_by_search'));
  k6.check(vouSearchRes, {
    'vouchers.get_by_search: status 200':                                    (r) => r.status === 200,
    'vouchers.get_by_search: has data array':                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`vouchers.get_by_search: under ${limit['vouchers.get_by_search']}ms`]:  (r) => r.timings.duration < limit['vouchers.get_by_search'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_search' });
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
export function teardown() {
  console.log('[smoke] All-modules smoke test complete — 44 endpoints verified.');
}

// ─── Report config ────────────────────────────────────────────────────────────
const REPORT_CONFIG = {
  title:    'All Modules Smoke Test Report',
  subtitle: '1 VU · 1 iteration · 44 endpoints',
  module:   'smoke',
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
    'tests/smoke/reports/all-modules-smoke-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
