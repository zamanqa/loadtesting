// k6 write helpers for Orders module
import { circulydbRequest } from '../helpers/apiClient.js';
import { getCreateOrderPayload, getUpdateAddressPayload } from '../payloads/orderPayloads.js';

export function createCustomerOrder(token, companyId, chargeByInvoice = true) {
  return circulydbRequest('POST', '/orders/full', token, companyId, { body: getCreateOrderPayload(chargeByInvoice) });
}

export function chargeOrder(orderId, token, companyId) {
  return circulydbRequest('POST', `/orders/${orderId}/charge`, token, companyId, { body: { message: 'Test Message' } });
}

export function generateInvoice(orderId, token, companyId) {
  return circulydbRequest('POST', `/orders/${orderId}/generate-invoice`, token, companyId, { body: { send_email: true } });
}

export function updateOrderAddress(orderId, token, companyId) {
  return circulydbRequest('PUT', `/orders/${orderId}/address`, token, companyId, { body: getUpdateAddressPayload() });
}

export function tagOrder(orderId, tagPayload, token, companyId) {
  return circulydbRequest('PUT', `/orders/${orderId}`, token, companyId, { body: tagPayload });
}

export function fulfillOrders(orderIds, token, companyId) {
  return circulydbRequest('POST', '/orders/fulfill', token, companyId, { body: { order_ids: orderIds } });
}

export function cancelOrder(orderId, token, companyId) {
  return circulydbRequest('POST', `/orders/${orderId}/cancel`, token, companyId, { body: {} });
}

export function postOrderNote(orderId, note, token, companyId) {
  return circulydbRequest('POST', `/orders/${orderId}/notes`, token, companyId, { body: note });
}
