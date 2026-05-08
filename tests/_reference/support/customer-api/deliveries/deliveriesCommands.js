import { cssRequest, getCompanyId } from '../_shared/apiClient';
import {
  getShippingDateFromDBQuery,
  verifyDeliveryByDateQuery
} from './deliveryQueries';

export function getShippingDateFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getShippingDateFromDBQuery(companyId));
}

export function getAllDeliveries() {
  return cssRequest('GET', '/css/api/deliveries');
}

export function getDeliveryByDate(shippingDate) {
  return cssRequest('GET', `/css/api/deliveries/${shippingDate}`);
}

export function verifyDeliveryInDB(shippingDate) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyDeliveryByDateQuery(companyId, shippingDate)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification — delivery exists for shipping date: ${shippingDate}`);
    cy.log(`DB record ID: ${result[0].id}, subscription_id: ${result[0].subscription_id}`);
  });
}
