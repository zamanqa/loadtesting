import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getOrderIdQuery,
  getChargeableOrderIdQuery,
  getInvoiceableOrderIdQuery,
  checkOrderExistsQuery,
  checkOrderItemExistsQuery,
  getOrderStatusQuery,
  deleteStaleJobsQuery,
  disableAllCronsQuery,
  enableSpecificCronsQuery,
  resetAllCronsQuery
} from './orderQueries';
import { getCreateOrderPayload, getUpdateAddressPayload } from './orderPayloads';

export function getCustomerOrders() {
  return circulydbRequest('GET', '/orders');
}

export function getOrderIdFromDB() {
  const companyId = Cypress.env('companyId');
  const query = getOrderIdQuery(companyId);
  return cy.task('queryDb', query);
}

export function getOrderById(orderId) {
  return circulydbRequest('GET', `/orders/${orderId}`);
}

export function createCustomerOrder(chargeByInvoice = true) {
  const requestBody = getCreateOrderPayload(chargeByInvoice);
  return circulydbRequest('POST', '/orders/full', { body: requestBody });
}

export function getPaymentUpdateLink(orderId) {
  return circulydbRequest('GET', `/orders/${orderId}/payment-update-link`);
}

export function getPaymentDetails(orderId) {
  return circulydbRequest('GET', `/orders/${orderId}/payment-details`);
}

export function postOrderNote(orderId, note) {
  return circulydbRequest('POST', `/orders/${orderId}/notes`, { body: note });
}

export function fulfillOrders(orderIds) {
  return circulydbRequest('POST', '/orders/fulfill', { body: { order_ids: orderIds } });
}

export function cancelOrder(orderId) {
  return circulydbRequest('POST', `/orders/${orderId}/cancel`, { body: {} });
}

export function getChargeableOrderIdFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getChargeableOrderIdQuery(companyId));
}

export function chargeOrder(orderId) {
  return circulydbRequest('POST', `/orders/${orderId}/charge`, {
    body: { message: 'Test Message' }
  });
}

export function getInvoiceableOrderIdFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getInvoiceableOrderIdQuery(companyId));
}

export function generateInvoice(orderId) {
  return circulydbRequest('POST', `/orders/${orderId}/generate-invoice`, {
    body: { send_email: true }
  });
}

export function updateOrderAddress(orderId) {
  return circulydbRequest('PUT', `/orders/${orderId}/address`, {
    body: getUpdateAddressPayload()
  });
}

export function tagOrder(orderId, tagPayload) {
  return circulydbRequest('PUT', `/orders/${orderId}`, { body: tagPayload });
}

export function getOrderStatus(orderId) {
  return cy.task('queryDb', getOrderStatusQuery(orderId)).then((result) => {
    cy.log(`Order ${orderId} status: ${result[0]?.status}`);
  });
}

export function verifyOrderStatusInDB(orderId, expectedStatus) {
  return cy.task('queryDb', getOrderStatusQuery(orderId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].status).to.eq(expectedStatus);
    cy.log(`Order ${orderId} status verified: ${expectedStatus}`);
  });
}

export function deleteStaleJobs() {
  return cy.task('queryDb', deleteStaleJobsQuery()).then(() => {
    cy.log('Stale jobs deleted (customers_api with 0 attempts)');
  });
}

export function disableAllCrons() {
  return cy.task('queryDb', disableAllCronsQuery()).then(() => {
    cy.log('All crons disabled');
  });
}

export function enableSpecificCrons() {
  return cy.task('queryDb', enableSpecificCronsQuery()).then(() => {
    cy.log('Customer API queue cron enabled');
  });
}

export function resetAllCrons() {
  return cy.task('queryDb', resetAllCronsQuery()).then(() => {
    cy.log('All crons reset (disabled)');
  });
}

export function checkCustomerOrderExistsInDatabase(orderId) {
  return cy.task('queryDb', checkOrderExistsQuery(orderId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Order ${orderId} exists in the database`);
  });
}

export function checkCustomerOrderItemExistsInDatabase(orderId) {
  return cy.task('queryDb', checkOrderItemExistsQuery(orderId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Order items for ${orderId} exist in the database (${result.length} items)`);
  });
}

export function getOrdersByFilter() {
  return circulydbRequest('GET', '/orders', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getOrdersBySearch(orderId) {
  return circulydbRequest('GET', '/orders', {
    qs: { search: orderId, sort: 'created_at', desc: true }
  });
}
