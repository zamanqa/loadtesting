// k6 write helpers for Draft Orders module
import { circulydbRequest } from '../helpers/apiClient.js';
import { getDraftOrderPayload } from '../payloads/draftOrderPayloads.js';

export { getDraftOrderPayload };

export function createDraftOrder(payload, token, companyId) {
  return circulydbRequest('POST', '/draft-orders', token, companyId, { body: payload });
}

export function deleteDraftOrderById(orderId, token, companyId) {
  return circulydbRequest('DELETE', `/draft-orders/${orderId}`, token, companyId);
}
