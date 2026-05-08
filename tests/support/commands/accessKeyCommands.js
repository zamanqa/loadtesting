// k6 helpers for Access Keys module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllAccessKeys(token, companyId) {
  return circulydbRequest('GET', '/keys', token, companyId);
}

export function getAccessKeyByKey(key, token, companyId) {
  return circulydbRequest('GET', `/keys?key=${key}`, token, companyId);
}

export function createAccessKey(payload, token, companyId) {
  return circulydbRequest('POST', '/keys', token, companyId, { body: payload });
}

export function assignAccessKey(payload, token, companyId) {
  return circulydbRequest('POST', '/assign', token, companyId, { body: payload });
}

export function deleteAccessKey(keyId, token, companyId) {
  return circulydbRequest('DELETE', `/keys/${keyId}`, token, companyId);
}
