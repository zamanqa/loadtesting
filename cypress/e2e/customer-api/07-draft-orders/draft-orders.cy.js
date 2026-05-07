import * as draftOrders from '../../../support/customer-api/draft-orders/draftOrdersCommands';

describe('Draft Orders API', () => {

  beforeEach(() => {
    draftOrders.getSubscriptionProductVariantFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const variant = result[0];

      cy.log('DB product variant found:');
      cy.log('Product ID:', variant.product_id);
      cy.log('Variant ID:', variant.variant_id);
      cy.log('SKU:', variant.sku);

      Cypress.env('dbProductId', Number(variant.product_id));
      Cypress.env('dbVariantId', Number(variant.variant_id));
      Cypress.env('dbSku', variant.sku);
      Cypress.env('dbShopVariantId', variant.shop_variant_id);
      Cypress.env('dbPrice', Number(variant.price));
      Cypress.env('dbProductName', `${variant.product_name} | ${variant.variant_name}`);
    });
  });

  it('Test 1: Create a new draft order with dynamic product data and verify in DB', () => {
    const productId = Cypress.env('dbProductId');
    const variantId = Cypress.env('dbVariantId');
    const sku = Cypress.env('dbSku');
    const shopVariantId = Cypress.env('dbShopVariantId');
    const price = Cypress.env('dbPrice');
    const productName = Cypress.env('dbProductName');

    const payload = draftOrders.getDraftOrderPayload(
      productId, variantId, sku, shopVariantId, price, productName
    );

    cy.log('Creating draft order with:');
    cy.log('Product ID:', productId);
    cy.log('Variant ID:', variantId);

    draftOrders.createDraftOrder(payload).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('order_checkout_link');

      const draftOrderId = response.body.id;
      cy.log('Draft Order created, ID:', draftOrderId);

      Cypress.env('createdDraftOrderId', draftOrderId);

      draftOrders.verifyDraftOrderCreatedInDB(draftOrderId);
    });
  });

  it('Test 2: Fetch all draft orders and save the first ID', () => {
    draftOrders.getAllDraftOrders().then((response) => {
      expect(response.status).to.eq(200);

      const orders = response.body.data;
      expect(orders).to.be.an('array').and.have.length.greaterThan(0);

      const firstOrder = orders[0];
      cy.log('Total draft orders returned:', orders.length);
      cy.log('First Draft Order ID:', firstOrder.id);

      Cypress.env('savedDraftOrderId', firstOrder.id);
    });
  });

  it('Test 3: Fetch a specific draft order by ID', () => {
    const draftOrderId = Cypress.env('savedDraftOrderId');
    expect(draftOrderId, 'Draft Order ID should exist').to.exist;

    draftOrders.getDraftOrderById(draftOrderId).then((response) => {
      expect(response.status).to.eq(200);

      const order = response.body;
      expect(order).to.have.property('id', draftOrderId);
      expect(order).to.have.property('order_checkout_link');

      cy.log('Fetched Draft Order ID:', order.id);
      cy.log('Status:', order.status);
    });
  });

  it('Test 4: Delete a specific draft order by ID and verify in DB', () => {
    const draftOrderId = Cypress.env('savedDraftOrderId');
    expect(draftOrderId, 'Draft Order ID should exist').to.exist;

    draftOrders.deleteDraftOrderById(draftOrderId).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Draft Order deleted successfully, ID:', draftOrderId);

      draftOrders.verifyDraftOrderDeletedInDB(draftOrderId);
    });
  });

  it('Test 5: Get draft orders by filter (paginated)', () => {
    draftOrders.getDraftOrdersByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered draft orders count:', response.body.data.length);
    });
  });

  it('Test 6: Get draft orders by search using DB draft order name', () => {
    draftOrders.getLatestDraftOrderFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const name = result[0].name;
      cy.log('Searching draft orders with name:', name);

      draftOrders.getDraftOrdersBySearch(name).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('data');
        cy.log('Search results count:', response.body.data.length);
      });
    });
  });

});
