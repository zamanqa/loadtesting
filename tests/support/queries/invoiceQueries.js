// k6 GET helpers for Invoices module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getCustomerInvoices(token, companyId) {
  return circulydbRequest('GET', '/paginated-invoices', token, companyId);
}

export function getInvoiceById(invoiceNumber, token, companyId) {
  return circulydbRequest('GET', `/invoices/${invoiceNumber}`, token, companyId);
}

export function getInvoicesByFilter(token, companyId) {
  return circulydbRequest('GET', '/paginated-invoices?page=1&per_page=10&sort=created_at&desc=true', token, companyId);
}

export function getInvoicesBySearch(invoiceNumber, token, companyId) {
  return circulydbRequest('GET', `/paginated-invoices?search=${invoiceNumber}`, token, companyId);
}
