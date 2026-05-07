import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getTransactionByCompanyQuery,
  verifyTransactionByIdQuery,
} from './transactionQueries';

export function getTransactionFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getTransactionByCompanyQuery(companyId));
}

export function getCustomerTransactions() {
  return circulydbRequest('GET', '/transactions');
}

export function getTransactionById(transactionId) {
  return circulydbRequest('GET', `/transactions/${transactionId}`);
}

export function verifyTransactionInDB(transactionId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyTransactionByIdQuery(companyId, transactionId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification — transaction exists with ID: ${transactionId}`);
    cy.log(`DB type: ${result[0].type}, status: ${result[0].status}, amount: ${result[0].amount_paid}`);
  });
}

export function getTransactionsByFilter() {
  return circulydbRequest('GET', '/transactions', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getTransactionsBySearch(transactionId) {
  return circulydbRequest('GET', '/transactions', {
    qs: { search: transactionId, sort: 'created_at', desc: true }
  });
}
