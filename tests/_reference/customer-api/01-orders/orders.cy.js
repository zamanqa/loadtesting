import * as orders from "../../../support/customer-api/orders/orderCommands";
import { wakeUpServers } from "../../../support/helpers/apiHealthCheck";

describe('Customer Orders API - Separated Tests Using Commands', () => {

  // Runs ONCE before all tests — wakes up Heroku dynos and Checkout API
  before(() => {
    wakeUpServers();
  });

  beforeEach(() => {
    orders.getOrderIdFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      cy.log('DB Order ID:', result[0].order_id);
      Cypress.env('dbOrderId', result[0].order_id);
    });
  });

  it('Test 1: Return a paginated list of orders', () => {
    orders.getCustomerOrders().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Total Orders:', response.body.data.length);
    });
  });

  it('Test 2: Find order by ID from DB and verify via API', () => {
    orders.getOrderById(Cypress.env('dbOrderId')).then((response) => {
      expect(response.status).to.eq(200);
    });
  });

  it('Test 3: Create a new order with random 12-digit order_id', () => {
    orders.createCustomerOrder().then((response) => {
      const createdOrderId = response.body.order_id;
      cy.log('Created Order ID:', createdOrderId);

      orders.checkCustomerOrderExistsInDatabase(createdOrderId);
    });
  });

  it('Test 4: Open payment update link for a specific order', () => {
    orders.getPaymentUpdateLink(Cypress.env('dbOrderId')).then((response) => {
      expect(response.status).to.eq(200);
      const link = response.body.link;

      cy.log('Opening link:', link);
      expect(link).to.be.a('string').and.not.to.be.empty;
    });
  });

  it('Test 5: Fetch payment details and verify provider', () => {
    orders.getPaymentDetails(Cypress.env('dbOrderId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('payment_provider', 'stripe');

      cy.log('Payment Provider:', response.body.payment_provider);
    });
  });

  it('Test 6: Create a note to order and verify success', () => {
    const notePayload = {
      author: "amine",
      message: "test",
      description: "test",
      pinned: false
    };

    orders.postOrderNote(Cypress.env('dbOrderId'), notePayload).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property('success', true);

      cy.log('Note successfully posted.');
    });
  });

  it('Test 7: Fulfill order using DB order ID', { defaultCommandTimeout: 120000 }, () => {
    orders.deleteStaleJobs();
    orders.disableAllCrons();
    orders.enableSpecificCrons();
    orders.getOrderStatus(Cypress.env('dbOrderId'));

    orders.fulfillOrders([Cypress.env('dbOrderId')]).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property(
        'message',
        '1:orders meet fulfillment criteria, process started.'
      );

      cy.log('Fulfillment triggered for order:', Cypress.env('dbOrderId'));
    });

    cy.wait(90000);

    orders.verifyOrderStatusInDB(Cypress.env('dbOrderId'), 'fulfilled');
    orders.resetAllCrons();
  });

  it('Test 8: Cancel order using DB order ID', () => {
    orders.getOrderStatus(Cypress.env('dbOrderId'));

    orders.cancelOrder(Cypress.env('dbOrderId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.deep.equal({
        success: true,
        message: 'Cancelled'
      });

      cy.log('Order cancelled:', Cypress.env('dbOrderId'));
    });

    orders.verifyOrderStatusInDB(Cypress.env('dbOrderId'), 'cancelled');
  });

  it('Test 9: Tag order using DB order ID', () => {
    const tagPayload = {
      tag: 'deliveried',
      tag_date: '2027-03-13'
    };

    orders.tagOrder(Cypress.env('dbOrderId'), tagPayload).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Order tagged successfully:', response.body);
    });
  });

  it('Test 10: Create order then charge it', () => {
    // Step 1: Create a new order with charge_by_invoice: false
    orders.createCustomerOrder(false).then((createResponse) => {
      expect(createResponse.status).to.be.oneOf([200, 201]);
      expect(createResponse.body).to.have.property('success', true);
      expect(createResponse.body).to.have.property('order_id');

      const orderId = createResponse.body.order_id;
      cy.log('✓ Order created successfully');
      cy.log('Order ID:', orderId);
      cy.log('Message:', createResponse.body.message);
      cy.log('Created items:', JSON.stringify(createResponse.body.items?.created));

      cy.log('Charging order:', orderId);
      orders.chargeOrder(orderId).then((chargeResponse) => {
        expect(chargeResponse.status).to.eq(200);
        cy.log('✓ Order charged successfully:', orderId);
        cy.log('Charge response:', JSON.stringify(chargeResponse.body));
      });
    });
  });

  it('Test 11: Create order then generate invoice for it', () => {
    // Step 1: Create a new order
    orders.createCustomerOrder().then((createResponse) => {
      expect(createResponse.status).to.be.oneOf([200, 201]);
      expect(createResponse.body).to.have.property('success', true);
      expect(createResponse.body).to.have.property('order_id');

      const orderId = createResponse.body.order_id;
      cy.log('✓ Order created successfully');
      cy.log('Order ID:', orderId);
      cy.log('Message:', createResponse.body.message);
      cy.log('Created items:', JSON.stringify(createResponse.body.items?.created));

      // Step 3: Generate invoice using the created order_id
      cy.log('Generating invoice for order:', orderId);
      orders.generateInvoice(orderId).then((invoiceResponse) => {
        expect(invoiceResponse.status).to.be.oneOf([200, 201]);
        cy.log('✓ Invoice generated for order:', orderId);
        cy.log('Invoice response:', JSON.stringify(invoiceResponse.body));
      });
    });
  });

  it('Test 12: Update order address using DB order ID', () => {
    orders.updateOrderAddress(Cypress.env('dbOrderId')).then((response) => {
      expect(response.status).to.be.oneOf([200, 201]);
      cy.log('Order address updated for:', Cypress.env('dbOrderId'));
    });
  });

  it('Test 13: Get orders by filter (paginated)', () => {
    orders.getOrdersByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered orders count:', response.body.data.length);
    });
  });

  it('Test 14: Get orders by search using DB order ID', () => {
    orders.getOrdersBySearch(Cypress.env('dbOrderId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
