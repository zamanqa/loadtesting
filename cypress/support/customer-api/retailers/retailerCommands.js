import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getRetailerByCompanyQuery,
  verifyRetailerByIdQuery,
  verifyRetailerByLocationIdQuery,
} from './retailerQueries';

export function getRetailerFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getRetailerByCompanyQuery(companyId));
}

export function getAllRetailers() {
  return circulydbRequest('GET', '/retailers');
}

export function getRetailerByLocationId(locationId) {
  return circulydbRequest('GET', `/retailers/${locationId}`);
}

export function createRetailer(retailerData) {
  return circulydbRequest('POST', '/retailers', { body: retailerData });
}

export function updateRetailer(retailerId, updateData) {
  return circulydbRequest('PUT', `/retailers/${retailerId}`, { body: updateData });
}

export function verifyRetailerByLocationIdInDB(locationId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyRetailerByLocationIdQuery(companyId, locationId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification -- retailer exists for location_id: ${locationId}`);
    cy.log(`DB retailer: id=${result[0].id}, name=${result[0].name}, enabled=${result[0].enabled}`);
  });
}

export function verifyRetailerInDB(retailerId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyRetailerByIdQuery(companyId, retailerId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification -- retailer exists for id: ${retailerId}`);
    cy.log(`DB retailer: location_id=${result[0].location_id}, name=${result[0].name}, enabled=${result[0].enabled}`);
  });
}

export function getRetailersByFilter() {
  return circulydbRequest('GET', '/retailers', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getRetailersBySearch(name) {
  return circulydbRequest('GET', '/retailers', {
    qs: { search: name, sort: 'created_at', desc: true }
  });
}
