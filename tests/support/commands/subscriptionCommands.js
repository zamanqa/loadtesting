// k6 write helpers for Subscriptions module
import { circulydbRequest } from '../helpers/apiClient.js';
import { getConsumableSubscriptionPayload, getNormalBundleSubscriptionPayload } from '../payloads/subscriptionPayloads.js';

export { getConsumableSubscriptionPayload, getNormalBundleSubscriptionPayload };

export function createSubscription(subscriptionData, token, companyId) {
  return circulydbRequest('POST', '/subscriptions', token, companyId, { body: subscriptionData });
}

export function updateSubscription(subscriptionId, updateBody, token, companyId) {
  return circulydbRequest('PUT', `/subscriptions/${subscriptionId}`, token, companyId, { body: updateBody });
}

export function previewSubscription(subscriptionId, previewData, token, companyId) {
  return circulydbRequest('POST', `/subscriptions/${subscriptionId}/preview`, token, companyId, { body: previewData });
}

export function reactivateSubscription(subscriptionId, token, companyId) {
  return circulydbRequest('PUT', `/subscriptions/${subscriptionId}`, token, companyId, { body: { action: 'reactivate' } });
}

export function toggleAutoRenew(subscriptionId, autoRenew, token, companyId) {
  return circulydbRequest('PUT', `/subscriptions/${subscriptionId}`, token, companyId, { body: { action: 'auto_renew', auto_renew: autoRenew } });
}
