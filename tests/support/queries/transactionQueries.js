// k6 GET helpers for Transactions module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getCustomerTransactions(token, companyId) {
  return circulydbRequest('GET', '/transactions', token, companyId);
}

export function getTransactionById(transactionId, token, companyId) {
  return circulydbRequest('GET', `/transactions/${transactionId}`, token, companyId);
}

export function getTransactionsByFilter(token, companyId) {
  return circulydbRequest('GET', '/transactions?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getTransactionsBySearch(transactionId, token, companyId) {
  return circulydbRequest('GET', `/transactions?search=${transactionId}&sort=created_at&desc=true`, token, companyId);
}
