// k6 write helpers for CSS (Subscription Management) module
import { cssRequest } from '../helpers/apiClient.js';

export function reportSubscriptionIssue(subscriptionId, issuePayload, token) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/report-issue`, token, { body: issuePayload });
}

export function updateShippingDate(deliveryId, shippingDate, token) {
  return cssRequest('PUT', `/css/api/deliveries/${deliveryId}/shipping-date`, token, { body: { shipping_date: shippingDate } });
}

export function changeSubscriptionFrequency(subscriptionId, frequency, interval, token) {
  return cssRequest('PUT', `/css/api/subscriptions/${subscriptionId}/change-frequency`, token, {
    body: { subscription_frequency: frequency, subscription_frequency_interval: interval },
  });
}

export function bundleSwap(subscriptionId, productVariantId, token) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/bundle-swap`, token, { body: { product_variant_id: productVariantId } });
}

export function cancelSubscription(subscriptionId, cancelPayload, token) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/cancel`, token, { body: cancelPayload });
}

export function processBuyout(subscriptionId, buyoutPayload, token) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/process-buyout`, token, { body: buyoutPayload });
}

export function createOrderByCustomer(orderPayload, token) {
  return cssRequest('POST', '/css/api/orders/subscriptions', token, { body: orderPayload });
}
