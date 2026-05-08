// k6 GET helpers for Debtist module
import { debtistRequest } from '../helpers/apiClient.js';

export function getAllClaims(token, companyId) {
  return debtistRequest('GET', '/debtist/claims', token, companyId);
}

export function getClaimById(claimId, token, companyId) {
  return debtistRequest('GET', `/debtist/claims/${claimId}`, token, companyId);
}

export function getClaimByInvoice(invoiceId, token, companyId) {
  return debtistRequest('GET', `/debtist/invoice/${invoiceId}/claim`, token, companyId);
}

export function getDebtistInvoices(token, companyId) {
  return debtistRequest('GET', '/debtist/invoices', token, companyId);
}

export function getDebtistCustomers(token, companyId) {
  return debtistRequest('GET', '/debtist/customers', token, companyId);
}
