// k6 GET helpers for Vouchers module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getAllVouchers(token, companyId) {
  return circulydbRequest('GET', '/vouchers', token, companyId);
}

export function getVoucherByCode(voucherCode, token, companyId) {
  return circulydbRequest('GET', `/vouchers/${voucherCode}`, token, companyId);
}

export function getVouchersByFilter(token, companyId) {
  return circulydbRequest('GET', '/vouchers?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getVouchersBySearch(voucherCode, token, companyId) {
  return circulydbRequest('GET', `/vouchers?search=${voucherCode}&sort=created_at&desc=true`, token, companyId);
}
