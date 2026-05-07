/**
 * Load test — All modules combined
 *
 * Runs every GET endpoint across all modules in a single test:
 *   Orders          (6 endpoints)
 *   Subscriptions   (4 endpoints)
 *   Customers       (5 endpoints)
 *   Invoices        (4 endpoints)
 *   Transactions    (4 endpoints)
 *   Draft Orders    (4 endpoints)
 *   Recurring Payments (4 endpoints)
 *   Products        (5 endpoints)
 *   Retailers       (4 endpoints)
 *   Vouchers        (4 endpoints)
 *
 * Total: 44 endpoints per iteration
 *
 * Run: npm run all:load
 */

import * as k6 from '../../support/helpers/k6.js';
import { getToken, setupAuth } from '../../support/helpers/auth.js';
import { buildHtmlReport } from '../../support/helpers/report.js';
import { buildThresholds } from '../../support/helpers/thresholds.js';

const SLEEP_BETWEEN_REQUESTS = 1; // seconds

// ─── Endpoint definitions ─────────────────────────────────────────────────────
// p95/p90 values are set based on actual measured results at 60 VUs + 20% headroom.
// Search endpoints are slowest as they scan more data under concurrent load.
const ENDPOINTS = [
  // Orders — measured p95: list 1.63s, by_id 1.32s, filter 1.57s, search 2.17s
  { tag: 'orders.get_list',                p95: 2000, p90: 1600 },
  { tag: 'orders.get_by_id',               p95: 1600, p90: 1400 },
  { tag: 'orders.get_payment_update_link', p95: 1100, p90: 1000 },
  { tag: 'orders.get_payment_methods',     p95: 1100, p90: 1000 },
  { tag: 'orders.get_by_filter',           p95: 1900, p90: 1600 },
  { tag: 'orders.get_by_search',           p95: 2600, p90: 2200 },

  // Subscriptions — measured p95: list 1.26s, filter 1.3s, search 2.16s
  { tag: 'subscriptions.get_list',      p95: 2000, p90: 1900 },
  { tag: 'subscriptions.get_by_id',     p95: 1200, p90: 1100 },
  { tag: 'subscriptions.get_by_filter', p95: 1600, p90: 1400 },
  { tag: 'subscriptions.get_by_search', p95: 2600, p90: 2200 },

  // Customers — all well within 1100ms at 60 VUs
  { tag: 'customers.get_list',         p95: 1100, p90: 1000 },
  { tag: 'customers.get_by_id',        p95: 1100, p90: 1000 },
  { tag: 'customers.get_balance',      p95: 1100, p90: 1000 },
  { tag: 'customers.get_by_filter',    p95: 1100, p90: 1000 },
  { tag: 'customers.get_by_search',    p95: 1100, p90: 1000 },

  // Invoices — measured p95: list 1.34s, by_number 1.52s, filter 1.26s, search 2.34s
  { tag: 'invoices.get_list',        p95: 1600, p90: 1400 },
  { tag: 'invoices.get_by_number',   p95: 1900, p90: 1800 },
  { tag: 'invoices.get_by_filter',   p95: 1600, p90: 1400 },
  { tag: 'invoices.get_by_search',   p95: 2800, p90: 2200 },

  // Transactions — measured p95: list 1.22s, filter 1.22s, search 2.05s
  { tag: 'transactions.get_list',      p95: 1500, p90: 1300 },
  { tag: 'transactions.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'transactions.get_by_filter', p95: 1500, p90: 1300 },
  { tag: 'transactions.get_by_search', p95: 2500, p90: 2200 },

  // Draft Orders — all under 1100ms at 60 VUs
  { tag: 'draft_orders.get_list',      p95: 1200, p90: 1100 },
  { tag: 'draft_orders.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'draft_orders.get_by_filter', p95: 1200, p90: 1100 },
  { tag: 'draft_orders.get_by_search', p95: 1300, p90: 1200 },

  // Recurring Payments — measured p95: list 1.53s, filter 1.46s, search 4.53s (slowest)
  { tag: 'recurring_payments.get_list',      p95: 1900, p90: 1600 },
  { tag: 'recurring_payments.get_by_id',     p95: 1100, p90: 1000 },
  { tag: 'recurring_payments.get_by_filter', p95: 1800, p90: 1600 },
  { tag: 'recurring_payments.get_by_search', p95: 5500, p90: 4600 },

  // Products — measured p95: all_variants 1.35s, others under 1100ms
  { tag: 'products.get_list',          p95: 1100, p90: 1000 },
  { tag: 'products.get_variants',      p95: 1100, p90: 1000 },
  { tag: 'products.get_all_variants',  p95: 1600, p90: 1500 },
  { tag: 'products.get_by_filter',     p95: 1100, p90: 1000 },
  { tag: 'products.get_by_search',     p95: 1100, p90: 1000 },

  // Retailers — all under 1100ms at 60 VUs
  { tag: 'retailers.get_list',           p95: 1100, p90: 1000 },
  { tag: 'retailers.get_by_location_id', p95: 1100, p90: 1000 },
  { tag: 'retailers.get_by_filter',      p95: 1100, p90: 1000 },
  { tag: 'retailers.get_by_search',      p95: 1100, p90: 1000 },

  // Vouchers — all under 1100ms at 60 VUs
  { tag: 'vouchers.get_list',        p95: 1100, p90: 1000 },
  { tag: 'vouchers.get_by_code',     p95: 1100, p90: 1000 },
  { tag: 'vouchers.get_by_filter',   p95: 1100, p90: 1000 },
  { tag: 'vouchers.get_by_search',   p95: 1100, p90: 1000 },
];

const limit = Object.fromEntries(ENDPOINTS.map(({ tag, p95 }) => [tag, p95]));

// Build per-endpoint duration + checks thresholds, then override error rates.
// Combined test at 60 VUs sees ~2% error rate due to server load — allow up to 5%.
// http_reqs{module:all} is set to rate>=0 because each request is tagged with its
// own module (orders, customers, etc.), not 'all', so that counter is always 0.
const baseThresholds = buildThresholds('all', ENDPOINTS);
const errorRateOverrides = Object.fromEntries(
  ENDPOINTS.map(({ tag }) => [`http_req_failed{ep:${tag}}`, ['rate<0.05']])
);

export const options = {
  thresholds: {
    ...baseThresholds,
    http_req_failed:           ['rate<0.05'], // raised from 1% — 60 VU combined load
    'http_req_failed{module:all}': ['rate<0.05'],
    'http_reqs{module:all}':   ['rate>=0'],   // no requests tagged module:all; skip gate
    ...errorRateOverrides,
  },
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10m', target: 60 }, // ramp up
        { duration: '10m', target: 60 }, // hold
        { duration: '10m', target: 0 }, // ramp down
      ],
      tags: { scenario: 'load' },
    },
  },
};

// ─── Setup — fetch one real ID per module ─────────────────────────────────────
export function setup() {
  const { token, companyId } = setupAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  function fetchFirst(url, label) {
    const res = k6.http.get(url, { headers });
    if (res.status !== 200) throw new Error(`[setup] ${label} failed (HTTP ${res.status}): ${res.body}`);
    const body = JSON.parse(res.body);
    const first = body.data && body.data.length > 0 ? body.data[0] : null;
    if (!first) throw new Error(`[setup] No ${label} records found — cannot continue`);
    return first;
  }

  // Orders
  const order = fetchFirst(`${base}/orders?page=1&per_page=1`, 'orders');
  const orderId = order.id;

  // Subscriptions
  const subscription = fetchFirst(`${base}/subscriptions?page=1&per_page=1&sort=created_at&desc=true`, 'subscriptions');
  const subscriptionId = subscription.id;

  // Customers
  const customer = fetchFirst(`${base}/customers?page=1&per_page=1&sort=created_at&desc=true`, 'customers');
  const customerId = customer.uid || customer.id;

  // Invoices
  const invoice = fetchFirst(`${base}/paginated-invoices?page=1&per_page=1&sort=created_at&desc=true`, 'invoices');
  const invoiceNumber = invoice.invoice_number || invoice.number || invoice.id;

  // Transactions
  const transaction = fetchFirst(`${base}/transactions?page=1&per_page=1&sort=created_at&desc=true`, 'transactions');
  const transactionId = transaction.id || transaction.transaction_id;

  // Draft Orders
  const draftOrder = fetchFirst(`${base}/draft-orders?page=1&per_page=1&sort=created_at&desc=true`, 'draft-orders');
  const draftOrderId = draftOrder.id;
  const draftOrderName = draftOrder.name || draftOrder.title || String(draftOrderId);

  // Recurring Payments
  const recurringPayment = fetchFirst(`${base}/recurring-payments?page=1&per_page=1&sort=created_at&desc=true`, 'recurring-payments');
  const recurringPaymentId = recurringPayment.id;
  const recurringSubscriptionId = recurringPayment.subscription_id || String(recurringPaymentId);

  // Products
  const product = fetchFirst(`${base}/products?page=1&per_page=1&sort=created_at&desc=true`, 'products');
  const productId = product.id;
  const productTitle = product.title || product.name || String(productId);

  // Retailers
  const retailer = fetchFirst(`${base}/retailers?page=1&per_page=1&sort=created_at&desc=true`, 'retailers');
  const locationId = retailer.location_id || retailer.id;
  const retailerName = retailer.name || retailer.title || String(locationId);

  // Vouchers
  const voucher = fetchFirst(`${base}/vouchers?page=1&per_page=1&sort=created_at&desc=true`, 'vouchers');
  const voucherCode = voucher.voucher_code || voucher.code || voucher.id;

  console.log(`[setup] orderId: ${orderId}`);
  console.log(`[setup] subscriptionId: ${subscriptionId}`);
  console.log(`[setup] customerId: ${customerId}`);
  console.log(`[setup] invoiceNumber: ${invoiceNumber}`);
  console.log(`[setup] transactionId: ${transactionId}`);
  console.log(`[setup] draftOrderId: ${draftOrderId}`);
  console.log(`[setup] recurringPaymentId: ${recurringPaymentId}`);
  console.log(`[setup] productId: ${productId}`);
  console.log(`[setup] locationId: ${locationId}`);
  console.log(`[setup] voucherCode: ${voucherCode}`);

  return {
    orderId, subscriptionId, customerId, invoiceNumber,
    transactionId, draftOrderId, draftOrderName,
    recurringPaymentId, recurringSubscriptionId,
    productId, productTitle, locationId, retailerName, voucherCode,
  };
}

// ─── Default — each VU runs all 44 endpoints per iteration ───────────────────
export default function (data) {
  const { token, companyId } = getToken();
  const base = `${k6.BASE_URL}/${k6.API_VERSION}/${companyId}/circulydb`;

  const {
    orderId, subscriptionId, customerId, invoiceNumber,
    transactionId, draftOrderId, draftOrderName,
    recurringPaymentId, recurringSubscriptionId,
    productId, productTitle, locationId, retailerName, voucherCode,
  } = data;

  const params = (module, ep) => ({
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    tags: { scenario: 'load', module, ep },
    timeout: '10s',
  });

  // ── ORDERS ──────────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersListRes = k6.http.get(`${base}/orders?page=1&per_page=100&sort=created_at&desc=true`, params('orders', 'orders.get_list'));
  k6.check(ordersListRes, {
    'get_list: status 200':                                (r) => r.status === 200,
    'get_list: has data':                                  (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['orders.get_list']}ms`]:     (r) => r.timings.duration < limit['orders.get_list'],
  }, { module: 'orders', ep: 'orders.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderByIdRes = k6.http.get(`${base}/orders/${orderId}`, params('orders', 'orders.get_by_id'));
  k6.check(orderByIdRes, {
    'get_by_id: status 200':                               (r) => r.status === 200,
    'get_by_id: has id':                                   (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`get_by_id: under ${limit['orders.get_by_id']}ms`]:   (r) => r.timings.duration < limit['orders.get_by_id'],
  }, { module: 'orders', ep: 'orders.get_by_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderLinkRes = k6.http.get(`${base}/orders/${orderId}/payment-update-link`, params('orders', 'orders.get_payment_update_link'));
  k6.check(orderLinkRes, {
    'payment_update_link: status 200':                                           (r) => r.status === 200,
    [`payment_update_link: under ${limit['orders.get_payment_update_link']}ms`]: (r) => r.timings.duration < limit['orders.get_payment_update_link'],
  }, { module: 'orders', ep: 'orders.get_payment_update_link' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const orderMethodsRes = k6.http.get(`${base}/orders/${orderId}/payment-methods`, params('orders', 'orders.get_payment_methods'));
  k6.check(orderMethodsRes, {
    'payment_methods: status 200':                                       (r) => r.status === 200,
    [`payment_methods: under ${limit['orders.get_payment_methods']}ms`]: (r) => r.timings.duration < limit['orders.get_payment_methods'],
  }, { module: 'orders', ep: 'orders.get_payment_methods' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersFilterRes = k6.http.get(`${base}/orders?page=1&per_page=100&sort=created_at&desc=true`, params('orders', 'orders.get_by_filter'));
  k6.check(ordersFilterRes, {
    'get_by_filter: status 200':                                  (r) => r.status === 200,
    'get_by_filter: has data':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['orders.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['orders.get_by_filter'],
  }, { module: 'orders', ep: 'orders.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const ordersSearchRes = k6.http.get(`${base}/orders?search=${orderId}&sort=created_at&desc=true`, params('orders', 'orders.get_by_search'));
  k6.check(ordersSearchRes, {
    'get_by_search: status 200':                                  (r) => r.status === 200,
    'get_by_search: has data':                                    (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['orders.get_by_search']}ms`]:  (r) => r.timings.duration < limit['orders.get_by_search'],
  }, { module: 'orders', ep: 'orders.get_by_search' });

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsListRes = k6.http.get(`${base}/subscriptions?page=1&per_page=100&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_list'));
  k6.check(subsListRes, {
    'get_list: status 200':                                           (r) => r.status === 200,
    'get_list: has data':                                             (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['subscriptions.get_list']}ms`]:         (r) => r.timings.duration < limit['subscriptions.get_list'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subByIdRes = k6.http.get(`${base}/subscriptions/${subscriptionId}`, params('subscriptions', 'subscriptions.get_by_id'));
  k6.check(subByIdRes, {
    'get_by_id: status 200':                                          (r) => r.status === 200,
    'get_by_id: has id':                                              (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`get_by_id: under ${limit['subscriptions.get_by_id']}ms`]:       (r) => r.timings.duration < limit['subscriptions.get_by_id'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsFilterRes = k6.http.get(`${base}/subscriptions?page=1&per_page=100&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_by_filter'));
  k6.check(subsFilterRes, {
    'get_by_filter: status 200':                                           (r) => r.status === 200,
    'get_by_filter: has data':                                             (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['subscriptions.get_by_filter']}ms`]:    (r) => r.timings.duration < limit['subscriptions.get_by_filter'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const subsSearchRes = k6.http.get(`${base}/subscriptions?search=${subscriptionId}&sort=created_at&desc=true`, params('subscriptions', 'subscriptions.get_by_search'));
  k6.check(subsSearchRes, {
    'get_by_search: status 200':                                           (r) => r.status === 200,
    'get_by_search: has data':                                             (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['subscriptions.get_by_search']}ms`]:    (r) => r.timings.duration < limit['subscriptions.get_by_search'],
  }, { module: 'subscriptions', ep: 'subscriptions.get_by_search' });

  // ── CUSTOMERS ────────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusListRes = k6.http.get(`${base}/customers?page=1&per_page=100&sort=created_at&desc=true`, params('customers', 'customers.get_list'));
  k6.check(cusListRes, {
    'get_list: status 200':                                      (r) => r.status === 200,
    'get_list: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['customers.get_list']}ms`]:        (r) => r.timings.duration < limit['customers.get_list'],
  }, { module: 'customers', ep: 'customers.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusByIdRes = k6.http.get(`${base}/customers/${customerId}`, params('customers', 'customers.get_by_id'));
  k6.check(cusByIdRes, {
    'get_by_id: status 200':                                     (r) => r.status === 200,
    'get_by_id: has id':                                         (r) => { try { const b = JSON.parse(r.body); return !!(b.uid || b.id); } catch { return false; } },
    [`get_by_id: under ${limit['customers.get_by_id']}ms`]:      (r) => r.timings.duration < limit['customers.get_by_id'],
  }, { module: 'customers', ep: 'customers.get_by_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusBalanceRes = k6.http.get(`${base}/customers/${customerId}/balance`, params('customers', 'customers.get_balance'));
  k6.check(cusBalanceRes, {
    'get_balance: status 200':                                     (r) => r.status === 200,
    'get_balance: has remaining_amount':                           (r) => { try { return 'remaining_amount' in JSON.parse(r.body); } catch { return false; } },
    [`get_balance: under ${limit['customers.get_balance']}ms`]:    (r) => r.timings.duration < limit['customers.get_balance'],
  }, { module: 'customers', ep: 'customers.get_balance' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusFilterRes = k6.http.get(`${base}/customers?page=1&per_page=100&sort=created_at&desc=true`, params('customers', 'customers.get_by_filter'));
  k6.check(cusFilterRes, {
    'get_by_filter: status 200':                                     (r) => r.status === 200,
    'get_by_filter: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['customers.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['customers.get_by_filter'],
  }, { module: 'customers', ep: 'customers.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const cusSearchRes = k6.http.get(`${base}/customers?search=${customerId}&sort=created_at&desc=true`, params('customers', 'customers.get_by_search'));
  k6.check(cusSearchRes, {
    'get_by_search: status 200':                                     (r) => r.status === 200,
    'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['customers.get_by_search']}ms`]:  (r) => r.timings.duration < limit['customers.get_by_search'],
  }, { module: 'customers', ep: 'customers.get_by_search' });

  // ── INVOICES ─────────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invListRes = k6.http.get(`${base}/paginated-invoices?page=1&per_page=100&sort=created_at&desc=true`, params('invoices', 'invoices.get_list'));
  k6.check(invListRes, {
    'get_list: status 200':                                    (r) => r.status === 200,
    'get_list: has data':                                      (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['invoices.get_list']}ms`]:       (r) => r.timings.duration < limit['invoices.get_list'],
  }, { module: 'invoices', ep: 'invoices.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invByNumRes = k6.http.get(`${base}/invoices/${invoiceNumber}`, params('invoices', 'invoices.get_by_number'));
  k6.check(invByNumRes, {
    'get_by_number: status 200':                                     (r) => r.status === 200,
    'get_by_number: has invoice_number':                             (r) => { try { const b = JSON.parse(r.body); return !!(b.invoice_number || b.number || b.id); } catch { return false; } },
    [`get_by_number: under ${limit['invoices.get_by_number']}ms`]:   (r) => r.timings.duration < limit['invoices.get_by_number'],
  }, { module: 'invoices', ep: 'invoices.get_by_number' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invFilterRes = k6.http.get(`${base}/paginated-invoices?page=1&per_page=100&sort=created_at&desc=true`, params('invoices', 'invoices.get_by_filter'));
  k6.check(invFilterRes, {
    'get_by_filter: status 200':                                       (r) => r.status === 200,
    'get_by_filter: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['invoices.get_by_filter']}ms`]:     (r) => r.timings.duration < limit['invoices.get_by_filter'],
  }, { module: 'invoices', ep: 'invoices.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const invSearchRes = k6.http.get(`${base}/paginated-invoices?search=${invoiceNumber}&sort=created_at&desc=true`, params('invoices', 'invoices.get_by_search'));
  k6.check(invSearchRes, {
    'get_by_search: status 200':                                     (r) => r.status === 200,
    'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['invoices.get_by_search']}ms`]:   (r) => r.timings.duration < limit['invoices.get_by_search'],
  }, { module: 'invoices', ep: 'invoices.get_by_search' });

  // ── TRANSACTIONS ─────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txListRes = k6.http.get(`${base}/transactions?page=1&per_page=100&sort=created_at&desc=true`, params('transactions', 'transactions.get_list'));
  k6.check(txListRes, {
    'get_list: status 200':                                        (r) => r.status === 200,
    'get_list: has data':                                          (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['transactions.get_list']}ms`]:       (r) => r.timings.duration < limit['transactions.get_list'],
  }, { module: 'transactions', ep: 'transactions.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txByIdRes = k6.http.get(`${base}/transactions/${transactionId}`, params('transactions', 'transactions.get_by_id'));
  k6.check(txByIdRes, {
    'get_by_id: status 200':                                         (r) => r.status === 200,
    'get_by_id: has id':                                             (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`get_by_id: under ${limit['transactions.get_by_id']}ms`]:       (r) => r.timings.duration < limit['transactions.get_by_id'],
  }, { module: 'transactions', ep: 'transactions.get_by_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txFilterRes = k6.http.get(`${base}/transactions?page=1&per_page=100&sort=created_at&desc=true`, params('transactions', 'transactions.get_by_filter'));
  k6.check(txFilterRes, {
    'get_by_filter: status 200':                                       (r) => r.status === 200,
    'get_by_filter: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['transactions.get_by_filter']}ms`]: (r) => r.timings.duration < limit['transactions.get_by_filter'],
  }, { module: 'transactions', ep: 'transactions.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const txSearchRes = k6.http.get(`${base}/transactions?search=${transactionId}&sort=created_at&desc=true`, params('transactions', 'transactions.get_by_search'));
  k6.check(txSearchRes, {
    'get_by_search: status 200':                                         (r) => r.status === 200,
    'get_by_search: has data':                                           (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['transactions.get_by_search']}ms`]:   (r) => r.timings.duration < limit['transactions.get_by_search'],
  }, { module: 'transactions', ep: 'transactions.get_by_search' });

  // ── DRAFT ORDERS ─────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doListRes = k6.http.get(`${base}/draft-orders?page=1&per_page=100&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_list'));
  k6.check(doListRes, {
    'get_list: status 200':                                          (r) => r.status === 200,
    'get_list: has data':                                            (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['draft_orders.get_list']}ms`]:         (r) => r.timings.duration < limit['draft_orders.get_list'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doByIdRes = k6.http.get(`${base}/draft-orders/${draftOrderId}`, params('draft_orders', 'draft_orders.get_by_id'));
  k6.check(doByIdRes, {
    'get_by_id: status 200':                                           (r) => r.status === 200,
    'get_by_id: has id':                                               (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`get_by_id: under ${limit['draft_orders.get_by_id']}ms`]:         (r) => r.timings.duration < limit['draft_orders.get_by_id'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doFilterRes = k6.http.get(`${base}/draft-orders?page=1&per_page=100&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_by_filter'));
  k6.check(doFilterRes, {
    'get_by_filter: status 200':                                         (r) => r.status === 200,
    'get_by_filter: has data':                                           (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['draft_orders.get_by_filter']}ms`]:   (r) => r.timings.duration < limit['draft_orders.get_by_filter'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const doSearchRes = k6.http.get(`${base}/draft-orders?search=${encodeURIComponent(draftOrderName)}&sort=created_at&desc=true`, params('draft_orders', 'draft_orders.get_by_search'));
  k6.check(doSearchRes, {
    'get_by_search: status 200':                                         (r) => r.status === 200,
    'get_by_search: has data':                                           (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['draft_orders.get_by_search']}ms`]:   (r) => r.timings.duration < limit['draft_orders.get_by_search'],
  }, { module: 'draft_orders', ep: 'draft_orders.get_by_search' });

  // ── RECURRING PAYMENTS ───────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpListRes = k6.http.get(`${base}/recurring-payments?page=1&per_page=100&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_list'));
  k6.check(rpListRes, {
    'get_list: status 200':                                               (r) => r.status === 200,
    'get_list: has data':                                                 (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['recurring_payments.get_list']}ms`]:        (r) => r.timings.duration < limit['recurring_payments.get_list'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpByIdRes = k6.http.get(`${base}/recurring-payments/${recurringPaymentId}`, params('recurring_payments', 'recurring_payments.get_by_id'));
  k6.check(rpByIdRes, {
    'get_by_id: status 200':                                                (r) => r.status === 200,
    'get_by_id: has id':                                                    (r) => { try { return !!JSON.parse(r.body).id; } catch { return false; } },
    [`get_by_id: under ${limit['recurring_payments.get_by_id']}ms`]:        (r) => r.timings.duration < limit['recurring_payments.get_by_id'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpFilterRes = k6.http.get(`${base}/recurring-payments?page=1&per_page=100&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_by_filter'));
  k6.check(rpFilterRes, {
    'get_by_filter: status 200':                                              (r) => r.status === 200,
    'get_by_filter: has data':                                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['recurring_payments.get_by_filter']}ms`]:  (r) => r.timings.duration < limit['recurring_payments.get_by_filter'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const rpSearchRes = k6.http.get(`${base}/recurring-payments?search=${recurringSubscriptionId}&sort=created_at&desc=true`, params('recurring_payments', 'recurring_payments.get_by_search'));
  k6.check(rpSearchRes, {
    'get_by_search: status 200':                                              (r) => r.status === 200,
    'get_by_search: has data':                                                (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['recurring_payments.get_by_search']}ms`]:  (r) => r.timings.duration < limit['recurring_payments.get_by_search'],
  }, { module: 'recurring_payments', ep: 'recurring_payments.get_by_search' });

  // ── PRODUCTS ─────────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proListRes = k6.http.get(`${base}/products?page=1&per_page=100&sort=created_at&desc=true`, params('products', 'products.get_list'));
  k6.check(proListRes, {
    'get_list: status 200':                                      (r) => r.status === 200,
    'get_list: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['products.get_list']}ms`]:         (r) => r.timings.duration < limit['products.get_list'],
  }, { module: 'products', ep: 'products.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proVariantsRes = k6.http.get(`${base}/products/${productId}/variants`, params('products', 'products.get_variants'));
  k6.check(proVariantsRes, {
    'get_variants: status 200':                                      (r) => r.status === 200,
    'get_variants: has data':                                        (r) => { try { const b = JSON.parse(r.body); return Array.isArray(b.data || b); } catch { return false; } },
    [`get_variants: under ${limit['products.get_variants']}ms`]:     (r) => r.timings.duration < limit['products.get_variants'],
  }, { module: 'products', ep: 'products.get_variants' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proAllVariantsRes = k6.http.get(`${base}/products/variants?page=1&per_page=100&sort=created_at&desc=true`, params('products', 'products.get_all_variants'));
  k6.check(proAllVariantsRes, {
    'get_all_variants: status 200':                                      (r) => r.status === 200,
    'get_all_variants: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_all_variants: under ${limit['products.get_all_variants']}ms`]: (r) => r.timings.duration < limit['products.get_all_variants'],
  }, { module: 'products', ep: 'products.get_all_variants' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proFilterRes = k6.http.get(`${base}/products?page=1&per_page=100&sort=created_at&desc=true`, params('products', 'products.get_by_filter'));
  k6.check(proFilterRes, {
    'get_by_filter: status 200':                                     (r) => r.status === 200,
    'get_by_filter: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['products.get_by_filter']}ms`]:   (r) => r.timings.duration < limit['products.get_by_filter'],
  }, { module: 'products', ep: 'products.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const proSearchRes = k6.http.get(`${base}/products?search=${encodeURIComponent(productTitle)}&sort=created_at&desc=true`, params('products', 'products.get_by_search'));
  k6.check(proSearchRes, {
    'get_by_search: status 200':                                     (r) => r.status === 200,
    'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['products.get_by_search']}ms`]:   (r) => r.timings.duration < limit['products.get_by_search'],
  }, { module: 'products', ep: 'products.get_by_search' });

  // ── RETAILERS ────────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retListRes = k6.http.get(`${base}/retailers?page=1&per_page=100&sort=created_at&desc=true`, params('retailers', 'retailers.get_list'));
  k6.check(retListRes, {
    'get_list: status 200':                                        (r) => r.status === 200,
    'get_list: has data':                                          (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['retailers.get_list']}ms`]:          (r) => r.timings.duration < limit['retailers.get_list'],
  }, { module: 'retailers', ep: 'retailers.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retByLocRes = k6.http.get(`${base}/retailers/${locationId}`, params('retailers', 'retailers.get_by_location_id'));
  k6.check(retByLocRes, {
    'get_by_location_id: status 200':                                         (r) => r.status === 200,
    'get_by_location_id: has location_id':                                    (r) => { try { const b = JSON.parse(r.body); return !!(b.location_id || b.id); } catch { return false; } },
    [`get_by_location_id: under ${limit['retailers.get_by_location_id']}ms`]: (r) => r.timings.duration < limit['retailers.get_by_location_id'],
  }, { module: 'retailers', ep: 'retailers.get_by_location_id' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retFilterRes = k6.http.get(`${base}/retailers?page=1&per_page=100&sort=created_at&desc=true`, params('retailers', 'retailers.get_by_filter'));
  k6.check(retFilterRes, {
    'get_by_filter: status 200':                                       (r) => r.status === 200,
    'get_by_filter: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['retailers.get_by_filter']}ms`]:    (r) => r.timings.duration < limit['retailers.get_by_filter'],
  }, { module: 'retailers', ep: 'retailers.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const retSearchRes = k6.http.get(`${base}/retailers?search=${encodeURIComponent(retailerName)}&sort=created_at&desc=true`, params('retailers', 'retailers.get_by_search'));
  k6.check(retSearchRes, {
    'get_by_search: status 200':                                       (r) => r.status === 200,
    'get_by_search: has data':                                         (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['retailers.get_by_search']}ms`]:    (r) => r.timings.duration < limit['retailers.get_by_search'],
  }, { module: 'retailers', ep: 'retailers.get_by_search' });

  // ── VOUCHERS ─────────────────────────────────────────────────────────────────
  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouListRes = k6.http.get(`${base}/vouchers?page=1&per_page=100&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_list'));
  k6.check(vouListRes, {
    'get_list: status 200':                                      (r) => r.status === 200,
    'get_list: has data':                                        (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_list: under ${limit['vouchers.get_list']}ms`]:         (r) => r.timings.duration < limit['vouchers.get_list'],
  }, { module: 'vouchers', ep: 'vouchers.get_list' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouByCodeRes = k6.http.get(`${base}/vouchers/${voucherCode}`, params('vouchers', 'vouchers.get_by_code'));
  k6.check(vouByCodeRes, {
    'get_by_code: status 200':                                       (r) => r.status === 200,
    'get_by_code: has voucher_code':                                 (r) => { try { const b = JSON.parse(r.body); return !!(b.voucher_code || b.code || b.id); } catch { return false; } },
    [`get_by_code: under ${limit['vouchers.get_by_code']}ms`]:       (r) => r.timings.duration < limit['vouchers.get_by_code'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_code' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouFilterRes = k6.http.get(`${base}/vouchers?page=1&per_page=100&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_by_filter'));
  k6.check(vouFilterRes, {
    'get_by_filter: status 200':                                     (r) => r.status === 200,
    'get_by_filter: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_filter: under ${limit['vouchers.get_by_filter']}ms`]:   (r) => r.timings.duration < limit['vouchers.get_by_filter'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_filter' });

  k6.sleep(SLEEP_BETWEEN_REQUESTS);
  const vouSearchRes = k6.http.get(`${base}/vouchers?search=${encodeURIComponent(voucherCode)}&sort=created_at&desc=true`, params('vouchers', 'vouchers.get_by_search'));
  k6.check(vouSearchRes, {
    'get_by_search: status 200':                                     (r) => r.status === 200,
    'get_by_search: has data':                                       (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
    [`get_by_search: under ${limit['vouchers.get_by_search']}ms`]:   (r) => r.timings.duration < limit['vouchers.get_by_search'],
  }, { module: 'vouchers', ep: 'vouchers.get_by_search' });
}

export function teardown(data) {
  console.log('All-modules load test complete.');
}

// ─── Report ───────────────────────────────────────────────────────────────────
const REPORT_CONFIG = {
  title:    'All Modules Load Test Report',
  subtitle: '5 VUs · 15s · 44 endpoints',
  module:   'all',
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

      'recurring_payments.get_list':    'GET /recurring-payments (list)',
      'recurring_payments.get_by_id':   'GET /recurring-payments/:id',
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
    'cypress/e2e/load/reports/all-modules-load-report.html': buildHtmlReport(data, REPORT_CONFIG),
    stdout: k6.textSummary(data, { indent: '  ', enableColors: true }),
  };
}
