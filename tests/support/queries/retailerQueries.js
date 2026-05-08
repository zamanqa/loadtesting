// k6 GET helpers for Retailers module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllRetailers(token, companyId) {
  return circulydbRequest('GET', '/retailers', token, companyId);
}

export function getRetailerByLocationId(locationId, token, companyId) {
  return circulydbRequest('GET', `/retailers/${locationId}`, token, companyId);
}

export function getRetailersByFilter(token, companyId) {
  return circulydbRequest('GET', '/retailers?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getRetailersBySearch(name, token, companyId) {
  return circulydbRequest('GET', `/retailers?search=${name}&sort=created_at&desc=true`, token, companyId);
}
