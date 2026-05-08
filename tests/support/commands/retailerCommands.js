// k6 write helpers for Retailers module
import { circulydbRequest } from '../helpers/apiClient.js';

export function createRetailer(retailerData, token, companyId) {
  return circulydbRequest('POST', '/retailers', token, companyId, { body: retailerData });
}

export function updateRetailer(retailerId, updateData, token, companyId) {
  return circulydbRequest('PUT', `/retailers/${retailerId}`, token, companyId, { body: updateData });
}
