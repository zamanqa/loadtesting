// k6 GET helpers for Notes module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllNotes(token, companyId) {
  return circulydbRequest('GET', '/notes', token, companyId);
}

export function getNoteById(noteId, token, companyId) {
  return circulydbRequest('GET', `/notes/${noteId}`, token, companyId);
}

export function getNotesByOrderId(orderId, token, companyId) {
  return circulydbRequest('GET', `/notes?order_id=${orderId}`, token, companyId);
}

export function getNotesByTransactionId(transactionId, token, companyId) {
  return circulydbRequest('GET', `/notes?transaction_id=${transactionId}`, token, companyId);
}

export function getNotesByCustomerId(customerId, token, companyId) {
  return circulydbRequest('GET', `/notes?customer_id=${customerId}`, token, companyId);
}

export function getNotesBySubscriptionId(subscriptionId, token, companyId) {
  return circulydbRequest('GET', `/notes?subscription_id=${subscriptionId}`, token, companyId);
}
