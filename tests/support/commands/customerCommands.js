// k6 write helpers for Customers module
import { circulydbRequest } from '../helpers/apiClient.js';
import { getCreateCustomerPayload, getValidateAddressPayload, getMergeCustomersPayload } from '../payloads/customerPayloads.js';

export function createCustomer(token, companyId) {
  return circulydbRequest('POST', '/customers', token, companyId, { body: getCreateCustomerPayload() });
}

export function updateCustomerExternalId(customerId, externalId, token, companyId) {
  return circulydbRequest('PUT', `/customers/${customerId}`, token, companyId, { body: { external_customer_id: externalId } });
}

export function addCustomerBalance(customerId, amount, token, companyId) {
  return circulydbRequest('PUT', `/customers/${customerId}/balance`, token, companyId, { body: { add: amount } });
}

export function createCustomerReferralCode(customerId, token, companyId) {
  return circulydbRequest('POST', `/customers/${customerId}/referral-code`, token, companyId);
}

export function validateAddress(token, companyId) {
  return circulydbRequest('POST', '/validate-address', token, companyId, { body: getValidateAddressPayload() });
}

export function transferCustomers(sourceCustomerId, targetCustomerId, token, companyId) {
  return circulydbRequest('POST', '/customers/transfer', token, companyId, { body: getMergeCustomersPayload(sourceCustomerId, targetCustomerId) });
}
