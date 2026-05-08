import { circulydbRequest } from '../_shared/apiClient';

// Access Keys URL: {{base_url}}/{{api_version}}/{{company_id}}/circulydb/{resource}
export function getAllAccessKeys() {
  return circulydbRequest('GET', '/keys');
}

export function getAccessKeyByKey(key) {
  return circulydbRequest('GET', `/keys?key=${key}`);
}

export function createAccessKey(payload) {
  return circulydbRequest('POST', '/keys', { body: payload });
}

export function assignAccessKey(payload) {
  return circulydbRequest('POST', '/assign', { body: payload });
}

export function deleteAccessKey(keyId) {
  return circulydbRequest('DELETE', `/keys/${keyId}`);
}
