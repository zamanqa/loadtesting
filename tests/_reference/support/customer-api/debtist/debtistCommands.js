import { debtistRequest, getCompanyId } from '../_shared/apiClient';
import {
  getDebtistClaimQuery,
  verifyDebtistClaimQuery,
  getClaimableInvoiceQuery,
  prepareInvoiceForClaimQuery,
  verifyClaimCreatedForInvoiceQuery,
} from './debtistQueries';

export function getDebtistClaimFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getDebtistClaimQuery(companyId));
}

export function getClaimableInvoiceFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getClaimableInvoiceQuery(companyId));
}

export function prepareInvoiceForClaim(transactionId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', prepareInvoiceForClaimQuery(companyId, transactionId));
}

// Debtist URL: {{base_url}}/{{api_version}}/{{company_id}}/debtist/{resource}
export function getAllClaims() {
  return debtistRequest('GET', '/debtist/claims');
}

export function getClaimById(claimId) {
  return debtistRequest('GET', `/debtist/claims/${claimId}`);
}

export function getClaimByInvoice(invoiceId) {
  return debtistRequest('GET', `/debtist/invoice/${invoiceId}/claim`);
}

export function fileClaimForInvoice(invoiceId) {
  return debtistRequest('POST', `/debtist/invoice/${invoiceId}/claim`);
}

export function getDebtistInvoices() {
  return debtistRequest('GET', '/debtist/invoices');
}

export function getDebtistCustomers() {
  return debtistRequest('GET', '/debtist/customers');
}

export function verifyDebtistClaimInDB(claimId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyDebtistClaimQuery(companyId, claimId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification -- claim_id: ${claimId}`);
    cy.log(`Status: ${result[0].status}, Stage: ${result[0].stage}`);
    cy.log(`Amount due: ${result[0].original_amount_due}`);
  });
}

export function verifyClaimCreatedForInvoiceInDB(invoiceId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyClaimCreatedForInvoiceQuery(companyId, invoiceId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification -- claim created for invoice: ${invoiceId}`);
    cy.log(`Claim ID: ${result[0].claim_id}, Status: ${result[0].status}`);
  });
}
