import { circulydbRequest } from '../_shared/apiClient';

export function getAllVouchers() {
  return circulydbRequest('GET', '/vouchers');
}

export function getVoucherByCode(voucherCode) {
  return circulydbRequest('GET', `/vouchers/${voucherCode}`);
}

export function createVoucher(voucherData) {
  return circulydbRequest('POST', '/vouchers', { body: voucherData });
}

export function updateVoucher(voucherId, updateData) {
  return circulydbRequest('PUT', `/vouchers/${voucherId}`, { body: updateData });
}

export function getVouchersByFilter() {
  return circulydbRequest('GET', '/vouchers', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getVouchersBySearch(voucherCode) {
  return circulydbRequest('GET', '/vouchers', {
    qs: { search: voucherCode, sort: 'created_at', desc: true }
  });
}
