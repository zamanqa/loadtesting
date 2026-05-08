import { cssRequest, getCompanyId } from '../_shared/apiClient';
import {
  getActiveConsumableSubscriptionQuery,
  getActiveNormalSubscriptionQuery,
  getDeliveryIdQuery,
  getProductVariantIdQuery,
  getStripeBuyoutSubscriptionQuery,
  getOrderVariantQuery,
} from './cssQueries';

export function getActiveConsumableSubscriptionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getActiveConsumableSubscriptionQuery(companyId));
}

export function getActiveNormalSubscriptionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getActiveNormalSubscriptionQuery(companyId));
}

export function getDeliveryIdFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getDeliveryIdQuery(companyId));
}

export function getProductVariantIdFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getProductVariantIdQuery(companyId));
}

export function getStripeBuyoutSubscriptionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getStripeBuyoutSubscriptionQuery(companyId));
}

export function getOrderVariantFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getOrderVariantQuery(companyId));
}

// CSS URL: {{base_url}}/{{api_version}}/css/api/{resource}
export function getSubscriptionDeliveries(subscriptionId) {
  return cssRequest('GET', `/css/api/subscriptions/${subscriptionId}/deliveries`);
}

export function reportSubscriptionIssue(subscriptionId, issuePayload) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/report-issue`, {
    body: issuePayload,
  });
}

export function updateShippingDate(deliveryId, shippingDate) {
  return cssRequest('PUT', `/css/api/deliveries/${deliveryId}/shipping-date`, {
    body: { shipping_date: shippingDate },
  });
}

export function changeSubscriptionFrequency(subscriptionId, frequency, interval) {
  return cssRequest('PUT', `/css/api/subscriptions/${subscriptionId}/change-frequency`, {
    body: {
      subscription_frequency: frequency,
      subscription_frequency_interval: interval,
    },
    timeout: 50000,
  });
}

export function bundleSwap(subscriptionId, productVariantId) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/bundle-swap`, {
    body: { product_variant_id: productVariantId },
  });
}

export function cancelSubscription(subscriptionId, cancelPayload) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/cancel`, {
    body: cancelPayload,
  });
}

export function processBuyout(subscriptionId, buyoutPayload) {
  return cssRequest('POST', `/css/api/subscriptions/${subscriptionId}/process-buyout`, {
    body: buyoutPayload,
  });
}

export function createOrderByCustomer(orderPayload) {
  return cssRequest('POST', '/css/api/orders/subscriptions', { body: orderPayload });
}
