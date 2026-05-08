import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getPaymentEligibleOrderQuery,
  checkInvoiceCreatedForOrderQuery
} from './paymentQueries';
import { getOneTimePaymentPayload } from './paymentPayloads';

export function getPaymentEligibleOrderFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getPaymentEligibleOrderQuery(companyId));
}

export function issueOneTimePayment(orderId) {
  return circulydbRequest('POST', '/one-time-payments', {
    body: getOneTimePaymentPayload(orderId)
  });
}

export function getRefundPayments() {
  return circulydbRequest('GET', '/refund-payments');
}

export function verifyInvoiceCreatedInDB(orderId) {
  return cy.task('queryDb', checkInvoiceCreatedForOrderQuery(orderId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Invoice created in DB for order ${orderId}: invoice_number = ${result[0].invoice_number}`);
  });
}
