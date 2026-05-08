// k6 GET helpers for Recurring Payments module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getRecurringPayments(token, companyId) {
  return circulydbRequest('GET', '/recurring-payments', token, companyId);
}

export function getRecurringPaymentById(id, token, companyId) {
  return circulydbRequest('GET', `/recurring-payments/${id}`, token, companyId);
}

export function getRecurringPaymentsByFilter(token, companyId) {
  return circulydbRequest('GET', '/recurring-payments?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getRecurringPaymentsBySearch(subscriptionId, token, companyId) {
  return circulydbRequest('GET', `/recurring-payments?search=${subscriptionId}&sort=created_at&desc=true`, token, companyId);
}
