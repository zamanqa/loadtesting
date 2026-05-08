// k6 GET helpers for Deliveries module (CSS URL pattern)
import { cssRequest } from '../helpers/apiClient.js';

export function getAllDeliveries(token) {
  return cssRequest('GET', '/css/api/deliveries', token);
}

export function getDeliveryByDate(shippingDate, token) {
  return cssRequest('GET', `/css/api/deliveries/${shippingDate}`, token);
}
