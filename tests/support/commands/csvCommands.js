// k6 helpers for CSV / Export module
import { circulydbRequest } from '../helpers/apiClient.js';

export function exportCustomers(token, companyId) {
  return circulydbRequest('POST', '/CSV', token, companyId, { body: { type: 'customers' } });
}

export function exportTransactions(token, companyId) {
  return circulydbRequest('POST', '/CSV', token, companyId, { body: { type: 'transactions' } });
}

export function exportSubscriptions(token, companyId) {
  return circulydbRequest('POST', '/CSV', token, companyId, { body: { type: 'subscriptions' } });
}

export function exportOrders(token, companyId) {
  return circulydbRequest('POST', '/CSV', token, companyId, { body: { type: 'orders' } });
}

export function exportInvoices(token, companyId) {
  return circulydbRequest('POST', '/CSV', token, companyId, { body: { type: 'invoices' } });
}

export function exportRecurringPayments(token, companyId) {
  return circulydbRequest('POST', '/CSV', token, companyId, { body: { type: 'recurring_payments' } });
}

export function triggerExport(payload, token, companyId) {
  return circulydbRequest('POST', '/export', token, companyId, { body: payload });
}

export function downloadExport(exportId, token, companyId) {
  return circulydbRequest('GET', `/exports/${exportId}`, token, companyId);
}
