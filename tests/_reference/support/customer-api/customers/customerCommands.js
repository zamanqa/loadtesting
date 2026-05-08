import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getCustomerIdQuery,
  getCustomerByIdQuery,
  getCustomerAccountQuery,
  checkExternalCustomerIdQuery,
  checkCustomerExistsQuery,
  getTwoRecentCustomersQuery,
  checkCustomerByUidQuery,
  checkOrdersByCustomerQuery,
  deleteReferralByEmailQuery,
  deleteReferralCodeQuery
} from './customerQueries';
import {
  getCreateCustomerPayload,
  getValidateAddressPayload,
  getMergeCustomersPayload
} from './customerPayloads';

export function getCustomerIdFromDB() {
  const companyId = Cypress.env('companyId');
  return cy.task('queryDb', getCustomerIdQuery(companyId));
}

export function getAllCustomers() {
  return circulydbRequest('GET', '/customers');
}

export function getCustomerById(customerId) {
  return circulydbRequest('GET', `/customers/${customerId}`);
}

export function getCustomerBalance(customerId) {
  return circulydbRequest('GET', `/customers/${customerId}/balance`);
}

export function addCustomerBalance(customerId, amount) {
  return circulydbRequest('PUT', `/customers/${customerId}/balance`, {
    body: { add: amount }
  });
}

export function updateCustomerExternalId(customerId, externalId) {
  return circulydbRequest('PUT', `/customers/${customerId}`, {
    body: { external_customer_id: externalId }
  });
}

export function createCustomerReferralCode(customerId) {
  return circulydbRequest('POST', `/customers/${customerId}/referral-code`);
}

export function getCustomerReferralCode(customerId) {
  return circulydbRequest('GET', `/customers/${customerId}/referral-code`);
}

export function createCustomer() {
  const requestBody = getCreateCustomerPayload();
  Cypress.env('createdCustomerEmail', requestBody.email);
  return circulydbRequest('POST', '/customers', { body: requestBody });
}

export function deleteReferralByEmail(email) {
  return cy.task('queryDb', deleteReferralByEmailQuery(email)).then(() => {
    cy.log(`Referral code(s) deleted for email: ${email}`);
  });
}

export function deleteReferralCodeFromDB(referralCode) {
  return cy.task('queryDb', deleteReferralCodeQuery(referralCode)).then(() => {
    cy.log('Deleted referral code from DB if it existed');
  });
}

export function verifyCustomerExistsInDB(email) {
  return cy.task('queryDb', checkCustomerExistsQuery(email)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Customer with email ${email} exists in the database`);
  });
}

export function verifyExternalCustomerIdInDB(customerId, expectedExternalId) {
  return cy.task('queryDb', checkExternalCustomerIdQuery(customerId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].external_customer_id).to.eq(expectedExternalId);
    cy.log(`Customer ${customerId} external_customer_id verified: ${expectedExternalId}`);
  });
}

export function verifyCustomerInDB(customerId) {
  return cy.task('queryDb', getCustomerByIdQuery(customerId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Customer ${customerId} exists in the database`);
  });
}

export function getCustomerAccountFromDB(email) {
  return cy.task('queryDb', getCustomerAccountQuery(email));
}

export function verifyCustomerBalanceInDB(email, expectedAmount) {
  return cy.task('queryDb', getCustomerAccountQuery(email)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Customer account remaining_amount: ${result[0].remaining_amount}`);
    expect(Number(result[0].remaining_amount)).to.eq(expectedAmount);
  });
}

export function validateAddress() {
  return circulydbRequest('POST', '/validate-address', {
    body: getValidateAddressPayload(),
    failOnStatusCode: false
  });
}

export function getTwoRecentCustomersFromDB() {
  const companyId = Cypress.env('companyId');
  return cy.task('queryDb', getTwoRecentCustomersQuery(companyId));
}

export function transferCustomers(sourceCustomerId, targetCustomerId) {
  return circulydbRequest('POST', '/customers/transfer', {
    body: getMergeCustomersPayload(sourceCustomerId, targetCustomerId)
  });
}

export function verifyCustomerTransferredInDB(sourceUid, targetUid) {
  const companyId = Cypress.env('companyId');

  cy.task('queryDb', checkOrdersByCustomerQuery(sourceUid, companyId)).then((result) => {
    const sourceCount = Number(result[0].count);
    cy.log(`Source customer ${sourceUid} has ${sourceCount} orders`);
    expect(sourceCount).to.eq(0);
  });

  return cy.task('queryDb', checkOrdersByCustomerQuery(targetUid, companyId)).then((result) => {
    const targetCount = Number(result[0].count);
    cy.log(`Target customer ${targetUid} has ${targetCount} orders`);
    expect(targetCount).to.be.greaterThan(0);
  });
}

export function getCustomersByFilter() {
  return circulydbRequest('GET', '/customers', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getCustomersBySearch(uid) {
  return circulydbRequest('GET', '/customers', {
    qs: { search: uid, sort: 'created_at', desc: true }
  });
}
