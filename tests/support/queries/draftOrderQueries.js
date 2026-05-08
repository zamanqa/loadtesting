// k6 GET helpers for Draft Orders module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllDraftOrders(token, companyId) {
  return circulydbRequest('GET', '/draft-orders', token, companyId);
}

export function getDraftOrderById(orderId, token, companyId) {
  return circulydbRequest('GET', `/draft-orders/${orderId}`, token, companyId);
}

export function getDraftOrdersByFilter(token, companyId) {
  return circulydbRequest('GET', '/draft-orders?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getDraftOrdersBySearch(searchTerm, token, companyId) {
  return circulydbRequest('GET', `/draft-orders?search=${searchTerm}&sort=created_at&desc=true`, token, companyId);
}
