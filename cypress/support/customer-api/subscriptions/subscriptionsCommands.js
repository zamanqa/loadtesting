import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getSubscriptionByCompanyQuery,
  verifySubscriptionQuery,
  getConsumableOrderItemQuery,
  getNormalBundleOrderItemQuery,
  verifySubscriptionCreatedQuery,
  deleteSubscriptionQuery,
  getActiveNormalSubscriptionQuery,
  verifyRealEndDateQuery,
  verifySerialNumberQuery,
  setSubscriptionStatusQuery,
  verifySubscriptionStatusQuery,
  verifyAutoRenewQuery
} from './subscriptionQueries';
import {
  getConsumableSubscriptionPayload,
  getNormalBundleSubscriptionPayload
} from './subscriptionPayloads';

export { getConsumableSubscriptionPayload, getNormalBundleSubscriptionPayload };

export function getSubscriptionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getSubscriptionByCompanyQuery(companyId));
}

export function getActiveNormalSubscriptionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getActiveNormalSubscriptionQuery(companyId));
}

export function getConsumableOrderItemFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getConsumableOrderItemQuery(companyId));
}

export function getNormalBundleOrderItemFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getNormalBundleOrderItemQuery(companyId));
}

export function getCustomerSubscriptions() {
  return circulydbRequest('GET', '/subscriptions');
}

export function getSubscriptionById(subscriptionId) {
  return circulydbRequest('GET', `/subscriptions/${subscriptionId}`);
}

export function createSubscription(subscriptionData) {
  return circulydbRequest('POST', '/subscriptions', { body: subscriptionData });
}

export function updateSubscription(subscriptionId, updateBody) {
  return circulydbRequest('PUT', `/subscriptions/${subscriptionId}`, { body: updateBody });
}

// POST /subscriptions/{id}/preview
export function previewSubscription(subscriptionId, previewData) {
  return circulydbRequest('POST', `/subscriptions/${subscriptionId}/preview`, {
    body: previewData
  });
}

// PUT /subscriptions/{id} with action: reactivate
export function reactivateSubscription(subscriptionId) {
  return circulydbRequest('PUT', `/subscriptions/${subscriptionId}`, {
    body: { action: 'reactivate' }
  });
}

// PUT /subscriptions/{id} with action: auto_renew
export function toggleAutoRenew(subscriptionId, autoRenew) {
  return circulydbRequest('PUT', `/subscriptions/${subscriptionId}`, {
    body: { action: 'auto_renew', auto_renew: autoRenew }
  });
}

export function verifySubscriptionInDB(subscriptionId) {
  return cy.task('queryDb', verifySubscriptionQuery(subscriptionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Subscription ${subscriptionId} verified in DB`);
  });
}

export function verifySubscriptionCreatedInDB(subscriptionId) {
  return cy.task('queryDb', verifySubscriptionCreatedQuery(subscriptionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Subscription created in DB: ${subscriptionId}, status: ${result[0].status}`);
  });
}

export function verifyRealEndDateInDB(subscriptionId) {
  return cy.task('queryDb', verifyRealEndDateQuery(subscriptionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].real_end_date).to.not.be.null;
    cy.log(`real_end_date verified: ${result[0].real_end_date}`);
  });
}

export function verifySerialNumberInDB(subscriptionId, expectedSerial) {
  return cy.task('queryDb', verifySerialNumberQuery(subscriptionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].serial_number).to.eq(expectedSerial);
    cy.log(`serial_number verified: ${result[0].serial_number}`);
  });
}

export function verifySubscriptionStatusInDB(subscriptionId, expectedStatus) {
  return cy.task('queryDb', verifySubscriptionStatusQuery(subscriptionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].status).to.eq(expectedStatus);
    cy.log(`Subscription status verified: ${result[0].status}`);
  });
}

export function verifyAutoRenewInDB(subscriptionId, expectedValue) {
  return cy.task('queryDb', verifyAutoRenewQuery(subscriptionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].auto_renew).to.eq(expectedValue);
    cy.log(`auto_renew verified: ${result[0].auto_renew}`);
  });
}

export function deleteSubscriptionFromDB(subscriptionId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', deleteSubscriptionQuery(subscriptionId, companyId)).then(() => {
    cy.log(`Deleted subscription ${subscriptionId} from DB`);
  });
}

export function setSubscriptionStatusInDB(subscriptionId, status) {
  return cy.task('queryDb', setSubscriptionStatusQuery(subscriptionId, status)).then(() => {
    cy.log(`Set subscription ${subscriptionId} status to '${status}' in DB`);
  });
}

export function getSubscriptionsByFilter() {
  return circulydbRequest('GET', '/subscriptions', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getSubscriptionsBySearch(subscriptionId) {
  return circulydbRequest('GET', '/subscriptions', {
    qs: { search: subscriptionId, sort: 'created_at', desc: true }
  });
}
