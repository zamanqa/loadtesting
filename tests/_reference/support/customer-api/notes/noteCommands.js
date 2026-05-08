import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getNoteByCompanyQuery,
  getNoteBySubscriptionQuery,
  getNoteByTransactionQuery,
} from './noteQueries';

export function getNoteFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getNoteByCompanyQuery(companyId));
}

export function getNoteBySubscriptionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getNoteBySubscriptionQuery(companyId));
}

export function getNoteByTransactionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getNoteByTransactionQuery(companyId));
}

export function getAllNotes() {
  return circulydbRequest('GET', '/notes');
}

export function getNoteById(noteId) {
  return circulydbRequest('GET', `/notes/${noteId}`);
}

export function getNotesByOrderId(orderId) {
  return circulydbRequest('GET', `/notes?order_id=${orderId}`);
}

export function getNotesByTransactionId(transactionId) {
  return circulydbRequest('GET', `/notes?transaction_id=${transactionId}`);
}

export function getNotesByCustomerId(customerId) {
  return circulydbRequest('GET', `/notes?customer_id=${customerId}`);
}

export function getNotesBySubscriptionId(subscriptionId) {
  return circulydbRequest('GET', `/notes?subscription_id=${subscriptionId}`);
}
