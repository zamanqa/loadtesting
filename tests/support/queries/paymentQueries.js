// k6 GET helpers for Payments module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getRefundPayments(token, companyId) {
  return circulydbRequest('GET', '/refund-payments', token, companyId);
}
