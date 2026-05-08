import * as productVariants from '../../../support/customer-api/product-variants/productVariantsCommands';

describe('Customer API - Products & Variants', () => {

  beforeEach(() => {
    productVariants.getProductFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const product = result[0];

      cy.log('DB product found:');
      cy.log('Product ID:', product.id);
      cy.log('Title:', product.title);
      cy.log('SKU:', product.sku);

      Cypress.env('dbProductId', product.id);
      Cypress.env('dbProductTitle', product.title);
    });

    productVariants.getVariantFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const variant = result[0];

      cy.log('DB variant found:');
      cy.log('Variant ID:', variant.id);
      cy.log('Product ID:', variant.product_id);
      cy.log('Title:', variant.title);

      Cypress.env('dbVariantId', variant.id);
      Cypress.env('dbVariantProductId', variant.product_id);
    });
  });

  it('Test 1: Fetch all products and log details', () => {
    productVariants.getProducts().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data').and.to.be.an('array');

      const products = response.body.data;
      expect(products.length).to.be.greaterThan(0);

      cy.log('Total products returned:', products.length);
      cy.log('First Product ID:', products[0].id);
      cy.log('First Title:', products[0].title);
    });
  });

  it('Test 2: Fetch all variants and validate pagination', () => {
    productVariants.getVariants().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('is_paginated', true);
      expect(response.body).to.have.property('data').and.to.be.an('array');

      const variants = response.body.data;
      expect(variants.length).to.be.greaterThan(0);

      cy.log('Total variants returned:', variants.length);
      cy.log('First Variant ID:', variants[0].id);
    });
  });

  it('Test 3: Fetch variants by product ID and verify in DB', () => {
    const productId = Cypress.env('dbVariantProductId');
    expect(productId).to.exist;

    productVariants.getVariantsByProductId(productId).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('is_paginated');

      const data = response.body.data || response.body;
      cy.log('Variants returned for product:', Array.isArray(data) ? data.length : 'N/A');
    });
  });

  it('Test 4: Fetch variants for a product and verify in DB', () => {
    const variantId = Cypress.env('dbVariantId');
    const productId = Cypress.env('dbVariantProductId');
    expect(productId).to.exist;

    productVariants.getVariantsByProductId(productId).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Variants returned for product:', productId);
    });

    productVariants.verifyVariantInDB(variantId);
  });

  it('Test 5: Get products by filter (paginated)', () => {
    productVariants.getProductsByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered products count:', response.body.data.length);
    });
  });

  it('Test 6: Get products by search using DB product title', () => {
    productVariants.getProductsBySearch(Cypress.env('dbProductTitle')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
