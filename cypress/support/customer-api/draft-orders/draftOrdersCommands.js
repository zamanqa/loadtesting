import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getSubscriptionProductVariantQuery,
  getLatestDraftOrderQuery,
  verifyDraftOrderCreatedQuery,
  verifyDraftOrderDeletedQuery,
} from './draftOrderQueries';
import { getDraftOrderPayload } from './draftOrderPayloads';

export { getDraftOrderPayload };

export function getSubscriptionProductVariantFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getSubscriptionProductVariantQuery(companyId));
}

export function getLatestDraftOrderFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getLatestDraftOrderQuery(companyId));
}

export function createDraftOrder(payload) {
  return circulydbRequest('POST', '/draft-orders', {
    body: payload,
    timeout: 20000,
    failOnStatusCode: false,
  });
}

export function getAllDraftOrders() {
  return circulydbRequest('GET', '/draft-orders', { timeout: 20000 });
}

export function getDraftOrderById(orderId) {
  return circulydbRequest('GET', `/draft-orders/${orderId}`, { timeout: 20000 });
}

export function deleteDraftOrderById(orderId) {
  return circulydbRequest('DELETE', `/draft-orders/${orderId}`, {
    timeout: 20000,
    failOnStatusCode: false,
  });
}

export function verifyDraftOrderCreatedInDB(draftOrderId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyDraftOrderCreatedQuery(companyId, draftOrderId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification — draft order exists with ID: ${draftOrderId}`);
    cy.log(`DB status: ${result[0].status}, created_at: ${result[0].created_at}`);
  });
}

export function verifyDraftOrderDeletedInDB(draftOrderId) {
  return cy.task('queryDb', verifyDraftOrderDeletedQuery(draftOrderId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification — draft order ${draftOrderId} is soft-deleted`);
    cy.log(`DB deleted_at: ${result[0].deleted_at}`);
  });
}

export function getDraftOrdersByFilter() {
  return circulydbRequest('GET', '/draft-orders', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true },
    timeout: 20000
  });
}

export function getDraftOrdersBySearch(searchTerm) {
  return circulydbRequest('GET', '/draft-orders', {
    qs: { search: searchTerm, sort: 'created_at', desc: true },
    timeout: 20000
  });
}
