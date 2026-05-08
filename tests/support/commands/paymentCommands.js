// k6 write helpers for Payments module
import { circulydbRequest } from '../helpers/apiClient.js';
import { getOneTimePaymentPayload } from '../payloads/paymentPayloads.js';

export function issueOneTimePayment(orderId, token, companyId) {
  return circulydbRequest('POST', '/one-time-payments', token, companyId, { body: getOneTimePaymentPayload(orderId) });
}
