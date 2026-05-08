// k6 GET helpers for CSS (Subscription Management) module
import { cssRequest } from '../helpers/apiClient.js';

export function getSubscriptionDeliveries(subscriptionId, token) {
  return cssRequest('GET', `/css/api/subscriptions/${subscriptionId}/deliveries`, token);
}
