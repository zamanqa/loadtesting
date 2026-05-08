import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getInvoiceByCompanyQuery,
  getInvoiceByNumberQuery,
  getUnpaidInvoiceQuery,
  getRefundableInvoiceQuery,
  checkInvoicePaidQuery,
  checkRefundedTransactionQuery
} from './invoiceQueries';
import { getRefundPayload } from './invoicePayloads';

export function getInvoiceFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getInvoiceByCompanyQuery(companyId));
}

// GET /paginated-invoices
export function getCustomerInvoices() {
  return circulydbRequest('GET', '/paginated-invoices');
}

// GET /invoices/{invoice_number}  e.g. invoice-_22360
export function getInvoiceById(invoiceNumber) {
  return circulydbRequest('GET', `/invoices/${invoiceNumber}`);
}

// POST /invoices/{invoice_number}/settle
export function settleInvoice(invoiceNumber) {
  return circulydbRequest('POST', `/invoices/${invoiceNumber}/settle`);
}

// POST /invoices/{invoice_number}/refund
export function refundInvoice(invoiceNumber) {
  return circulydbRequest('POST', `/invoices/${invoiceNumber}/refund`, {
    body: getRefundPayload()
  });
}

export function getUnpaidInvoiceFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getUnpaidInvoiceQuery(companyId));
}

export function getRefundableInvoiceFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getRefundableInvoiceQuery(companyId));
}

export function verifyInvoicePaidInDB(invoiceNumber) {
  return cy.task('queryDb', checkInvoicePaidQuery(invoiceNumber)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].paid).to.eq(true);
    cy.log(`Invoice ${invoiceNumber} verified as paid in DB`);
  });
}

export function verifyInvoiceInDB(invoiceNumber) {
  return cy.task('queryDb', getInvoiceByNumberQuery(invoiceNumber)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`Invoice ${invoiceNumber} exists in DB`);
  });
}

export function verifyRefundInDB(transactionId) {
  return cy.task('queryDb', checkRefundedTransactionQuery(transactionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].refunded_transaction_id).to.eq(transactionId);
    cy.log(`Refund verified in DB: refunded_transaction_id = ${transactionId}`);
  });
}

export function getInvoicesByFilter() {
  return circulydbRequest('GET', '/paginated-invoices', {
    qs: { page: 1, per_page: 10, sort: 'created_at', desc: true }
  });
}

export function getInvoicesBySearch(invoiceNumber) {
  return circulydbRequest('GET', '/paginated-invoices', {
    qs: { search: invoiceNumber }
  });
}
