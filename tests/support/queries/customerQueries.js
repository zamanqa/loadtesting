// k6 GET helpers for Customers module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllCustomers(token, companyId) {
  return circulydbRequest('GET', '/customers', token, companyId);
}

export function getCustomerById(customerId, token, companyId) {
  return circulydbRequest('GET', `/customers/${customerId}`, token, companyId);
}

export function getCustomerBalance(customerId, token, companyId) {
  return circulydbRequest('GET', `/customers/${customerId}/balance`, token, companyId);
}

export function getCustomerReferralCode(customerId, token, companyId) {
  return circulydbRequest('GET', `/customers/${customerId}/referral-code`, token, companyId);
}

export function getCustomersByFilter(token, companyId) {
  return circulydbRequest('GET', '/customers?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getCustomersBySearch(uid, token, companyId) {
  return circulydbRequest('GET', `/customers?search=${uid}&sort=created_at&desc=true`, token, companyId);
}
