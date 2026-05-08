// k6 GET helpers for Product Tracking module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllProductTracking(token, companyId) {
  return circulydbRequest('GET', '/product-tracking', token, companyId);
}

export function getProductTrackingBySerial(serialNumber, token, companyId) {
  return circulydbRequest('GET', `/product-tracking/${serialNumber}`, token, companyId);
}
