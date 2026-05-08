// k6 write helpers for Product Tracking module
import { circulydbRequest } from '../helpers/apiClient.js';

export function postRepairRequest(serialNumber, token, companyId) {
  return circulydbRequest('POST', `/product-tracking/${serialNumber}/repair`, token, companyId, { body: { delete_rps: true } });
}

export function postStockRequest(serialNumber, token, companyId) {
  return circulydbRequest('POST', `/product-tracking/${serialNumber}/stock?do_not_restock=false`, token, companyId, { body: { location: 'Berlin' } });
}
