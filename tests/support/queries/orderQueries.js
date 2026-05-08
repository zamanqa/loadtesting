// k6 GET helpers for Orders module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getCustomerOrders(token, companyId) {
  return circulydbRequest('GET', '/orders', token, companyId);
}

export function getOrderById(orderId, token, companyId) {
  return circulydbRequest('GET', `/orders/${orderId}`, token, companyId);
}

export function getPaymentUpdateLink(orderId, token, companyId) {
  return circulydbRequest('GET', `/orders/${orderId}/payment-update-link`, token, companyId);
}

export function getPaymentDetails(orderId, token, companyId) {
  return circulydbRequest('GET', `/orders/${orderId}/payment-details`, token, companyId);
}

export function getOrdersByFilter(token, companyId) {
  return circulydbRequest('GET', '/orders?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getOrdersBySearch(orderId, token, companyId) {
  return circulydbRequest('GET', `/orders?search=${orderId}&sort=created_at&desc=true`, token, companyId);
}
