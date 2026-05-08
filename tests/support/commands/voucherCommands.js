// k6 write helpers for Vouchers module
import { circulydbRequest } from '../helpers/apiClient.js';

export function createVoucher(voucherData, token, companyId) {
  return circulydbRequest('POST', '/vouchers', token, companyId, { body: voucherData });
}

export function updateVoucher(voucherId, updateData, token, companyId) {
  return circulydbRequest('PUT', `/vouchers/${voucherId}`, token, companyId, { body: updateData });
}
