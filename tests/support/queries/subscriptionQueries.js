// k6 GET helpers for Subscriptions module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getCustomerSubscriptions(token, companyId) {
  return circulydbRequest('GET', '/subscriptions', token, companyId);
}

export function getSubscriptionById(subscriptionId, token, companyId) {
  return circulydbRequest('GET', `/subscriptions/${subscriptionId}`, token, companyId);
}

export function getSubscriptionsByFilter(token, companyId) {
  return circulydbRequest('GET', '/subscriptions?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getSubscriptionsBySearch(subscriptionId, token, companyId) {
  return circulydbRequest('GET', `/subscriptions?search=${subscriptionId}&sort=created_at&desc=true`, token, companyId);
}
