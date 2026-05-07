import { circulydbRequest, getCompanyId } from '../_shared/apiClient';
import {
  getProductByCompanyQuery,
  getVariantByCompanyQuery,
  verifyVariantByIdQuery,
} from './productVariantQueries';

export function getProductFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getProductByCompanyQuery(companyId));
}

export function getVariantFromDB() {
  const companyId = getCompanyId();
  return cy.task('queryDb', getVariantByCompanyQuery(companyId));
}

export function getProducts() {
  return circulydbRequest('GET', '/products');
}

export function getVariants() {
  return circulydbRequest('GET', '/products/variants');
}

export function getVariantsByProductId(productId) {
  return circulydbRequest('GET', `/products/${productId}/variants`);
}

export function verifyVariantInDB(variantId) {
  const companyId = getCompanyId();
  return cy.task('queryDb', verifyVariantByIdQuery(companyId, variantId)).then((result) => {
    expect(result.length).to.be.greaterThan(0);
    cy.log(`DB verification — variant exists with ID: ${variantId}`);
    cy.log(`DB title: ${result[0].title}, sku: ${result[0].sku}, price: ${result[0].price}`);
  });
}

export function getProductsByFilter() {
  return circulydbRequest('GET', '/products', {
    qs: { page: 1, per_page: 100, sort: 'created_at', desc: true }
  });
}

export function getProductsBySearch(title) {
  return circulydbRequest('GET', '/products', {
    qs: { search: title, sort: 'created_at', desc: true }
  });
}

