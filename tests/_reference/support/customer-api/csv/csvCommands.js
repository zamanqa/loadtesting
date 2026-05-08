import { circulydbRequest } from '../_shared/apiClient';

// CSV/Export URL: {{base_url}}/{{api_version}}/{{company_id}}/circulydb/{resource}
export function exportCustomers() {
  return circulydbRequest('POST', '/CSV', { body: { type: 'customers' } });
}

export function exportTransactions() {
  return circulydbRequest('POST', '/CSV', { body: { type: 'transactions' } });
}

export function exportSubscriptions() {
  return circulydbRequest('POST', '/CSV', { body: { type: 'subscriptions' } });
}

export function exportOrders() {
  return circulydbRequest('POST', '/CSV', { body: { type: 'orders' } });
}

export function exportInvoices() {
  return circulydbRequest('POST', '/CSV', { body: { type: 'invoices' } });
}

export function exportRecurringPayments() {
  return circulydbRequest('POST', '/CSV', { body: { type: 'recurring_payments' } });
}

export function triggerExport(payload) {
  return circulydbRequest('POST', '/export', { body: payload });
}

export function downloadExport(exportId) {
  return circulydbRequest('GET', `/exports/${exportId}`);
}
