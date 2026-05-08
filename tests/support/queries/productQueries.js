// k6 GET helpers for Products / Product Variants module
import { circulydbRequest } from '../helpers/apiClient.js';

export function getProducts(token, companyId) {
  return circulydbRequest('GET', '/products', token, companyId);
}

export function getVariants(token, companyId) {
  return circulydbRequest('GET', '/products/variants', token, companyId);
}

export function getVariantsByProductId(productId, token, companyId) {
  return circulydbRequest('GET', `/products/${productId}/variants`, token, companyId);
}

export function getProductsByFilter(token, companyId) {
  return circulydbRequest('GET', '/products?page=1&per_page=100&sort=created_at&desc=true', token, companyId);
}

export function getProductsBySearch(title, token, companyId) {
  return circulydbRequest('GET', `/products?search=${title}&sort=created_at&desc=true`, token, companyId);
}
