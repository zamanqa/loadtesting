import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getProductTrackingByCompanyQuery,
  getActiveSubscriptionSerialsQuery,
  getRepairSerialForStockQuery,
  verifyProductTrackingBySerialQuery,
  verifyLocationStatusQuery,
} from './productTrackingQueries';

export function getProductTrackingFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getProductTrackingByCompanyQuery(companyId));
}

export function getActiveSubscriptionSerials() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getActiveSubscriptionSerialsQuery(companyId));
}

export function getRepairSerialForStock() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getRepairSerialForStockQuery(companyId));
}

export function getAllProductTracking() {
  return circulydbRequest('GET', '/product-tracking');
}

export function getProductTrackingBySerial(serialNumber) {
  return circulydbRequest('GET', `/product-tracking/${serialNumber}`);
}

export function postRepairRequest(serialNumber) {
  return circulydbRequest('POST', `/product-tracking/${serialNumber}/repair`, {
    body: { delete_rps: true },
  });
}

export function postStockRequest(serialNumber) {
  return circulydbRequest('POST', `/product-tracking/${serialNumber}/stock?do_not_restock=false`, {
    body: { location: 'Berlin' },
  });
}

export function verifyProductTrackingInDB(serialNumber) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyProductTrackingBySerialQuery(companyId, serialNumber)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification -- product tracking exists for serial: ${serialNumber}`);
    cy.log(`DB product: ${result[0].product_name}, location_status: ${result[0].location_status}, location: ${result[0].location}`);
  });
}

export function verifyLocationStatusInDB(serialNumber, expectedStatus) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyLocationStatusQuery(companyId, serialNumber)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].location_status).to.eq(expectedStatus);
    cy.log(`DB verification -- location status for serial: ${serialNumber}`);
    cy.log(`Expected: ${expectedStatus}, Actual: ${result[0].location_status}`);
    cy.log(`DB location: ${result[0].location}, updated_at: ${result[0].updated_at}`);
  });
}
