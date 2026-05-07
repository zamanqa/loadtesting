import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getRecurringPaymentByCompanyQuery,
  verifyRecurringPaymentByIdQuery,
} from './recurringPaymentQueries';

export function getRecurringPaymentFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getRecurringPaymentByCompanyQuery(companyId));
}

export function getRecurringPayments() {
  return circulydbRequest('GET', '/recurring-payments');
}

export function getRecurringPaymentById(id) {
  return circulydbRequest('GET', `/recurring-payments/${id}`);
}

export function verifyRecurringPaymentInDB(recurringPaymentId) {
  return cy.task('queryDb', verifyRecurringPaymentByIdQuery(recurringPaymentId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification — recurring payment exists with ID: ${recurringPaymentId}`);
    cy.log(`DB status: ${result[0].status}, amount: ${result[0].amount}, enabled: ${result[0].enabled}`);
  });
}

export function getRecurringPaymentsByFilter() {
  return circulydbRequest('GET', '/recurring-payments', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getRecurringPaymentsBySearch(subscriptionId) {
  return circulydbRequest('GET', '/recurring-payments', {
    qs: { search: subscriptionId, sort: 'created_at', desc: true }
  });
}
