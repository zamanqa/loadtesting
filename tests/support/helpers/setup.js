/**
 * Shared setup helper — resolves one real ID per module before VUs start.
 *
 * Usage in any all-modules test:
 *
 *   import { fetchAllIds } from '../../support/helpers/setup.js';
 *
 *   export function setup() {
 *     const { token, companyId } = setupAuth();
 *     return fetchAllIds(token, companyId);
 *   }
 *
 * For spike (token must also survive to VUs):
 *
 *   export function setup() {
 *     const { token, companyId } = setupAuth();
 *     return { token, companyId, ...fetchAllIds(token, companyId) };
 *   }
 */

import http from 'k6/http';
import { BASE_URL, API_VERSION } from './k6.js';

function fetchFirst(hdrs, url, label) {
  const res = http.get(url, { headers: hdrs });
  if (res.status !== 200) {
    throw new Error(`[setup] ${label} failed (HTTP ${res.status}): ${res.body}`);
  }
  const body = JSON.parse(res.body);
  const first = body.data && body.data.length > 0 ? body.data[0] : null;
  if (!first) throw new Error(`[setup] No ${label} records found — cannot continue`);
  return first;
}

/**
 * Fetches one record per module and extracts the IDs used in default().
 * Always call inside setup() after setupAuth() returns a valid token.
 *
 * @param {string} token     - Bearer token from setupAuth()
 * @param {string} companyId - Company UUID from the auth response
 * @returns {object} Resolved IDs for all 10 modules
 */
export function fetchAllIds(token, companyId) {
  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const base = `${BASE_URL}/${API_VERSION}/${companyId}`;
  const get  = (path, label) => fetchFirst(hdrs, `${base}${path}`, label);

  const order            = get('/orders?page=1&per_page=1', 'orders');
  const subscription     = get('/subscriptions?page=1&per_page=1&sort=created_at&desc=true', 'subscriptions');
  const customer         = get('/customers?page=1&per_page=1&sort=created_at&desc=true', 'customers');
  const invoice          = get('/paginated-invoices?page=1&per_page=1&sort=created_at&desc=true', 'invoices');
  const transaction      = get('/transactions?page=1&per_page=1&sort=created_at&desc=true', 'transactions');
  const draftOrder       = get('/draft-orders?page=1&per_page=1&sort=created_at&desc=true', 'draft-orders');
  const recurringPayment = get('/recurring-payments?page=1&per_page=1&sort=created_at&desc=true', 'recurring-payments');
  const product          = get('/products?page=1&per_page=1&sort=created_at&desc=true', 'products');
  const retailer         = get('/retailers?page=1&per_page=1&sort=created_at&desc=true', 'retailers');
  const voucher          = get('/vouchers?page=1&per_page=1&sort=created_at&desc=true', 'vouchers');

  const ids = {
    orderId:                 order.id,
    subscriptionId:          subscription.id,
    customerId:              customer.uid || customer.id,
    invoiceNumber:           invoice.invoice_number || invoice.number || invoice.id,
    transactionId:           transaction.id || transaction.transaction_id,
    draftOrderId:            draftOrder.id,
    draftOrderName:          draftOrder.name || draftOrder.title || String(draftOrder.id),
    recurringPaymentId:      recurringPayment.id,
    recurringSubscriptionId: recurringPayment.subscription_id || String(recurringPayment.id),
    productId:               product.id,
    productTitle:            product.title || product.name || String(product.id),
    locationId:              retailer.location_id || retailer.id,
    retailerName:            retailer.name || retailer.title || String(retailer.id),
    voucherCode:             voucher.voucher_code || voucher.code || voucher.id,
  };

  console.log('[setup] IDs resolved:', JSON.stringify(ids));
  return ids;
}
