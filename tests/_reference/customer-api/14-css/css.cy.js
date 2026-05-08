import * as css from '../../../support/customer-api/css/cssCommands';

describe('Customer Self Service (CSS) API', () => {

  beforeEach(() => {
    css.getActiveConsumableSubscriptionFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const sub = result[0];

      cy.log('Active consumable subscription found:');
      cy.log('Subscription ID:', sub.subscription_id);
      cy.log('Type:', sub.subscription_type);

      Cypress.env('cssConsumableSubId', sub.subscription_id);
    });

    css.getActiveNormalSubscriptionFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const sub = result[0];

      cy.log('Active normal subscription found:');
      cy.log('Subscription ID:', sub.subscription_id);

      Cypress.env('cssNormalSubId', sub.subscription_id);
    });
  });

  it('Test 1: Fetch subscription deliveries and verify billing_date', () => {
    const subscriptionId = Cypress.env('cssConsumableSubId');
    expect(subscriptionId).to.exist;

    css.getSubscriptionDeliveries(subscriptionId).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array').and.have.length.greaterThan(0);
      expect(response.body[0]).to.have.property('billing_date');

      cy.log('Total deliveries returned:', response.body.length);
      cy.log('First Billing Date:', response.body[0].billing_date);
    });
  });

  it('Test 2: Report an issue for a subscription', () => {
    const subscriptionId = Cypress.env('cssConsumableSubId');
    expect(subscriptionId).to.exist;

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const issuePayload = {
      customer_email: 'c.test2489@gmail.com',
      message: 'E2E test — reported an issue',
      appointment: {
        date: futureDate,
        timeslot: { from: '10:00', to: '11:00' },
      },
    };

    css.reportSubscriptionIssue(subscriptionId, issuePayload).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('message', 'Issue reported, mail sent and note saved.');

      cy.log('Response message:', response.body.message);
    });
  });

  it('Test 3: Update shipping date for a delivery', () => {
    css.getDeliveryIdFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const deliveryId = result[0].id;
      const shippingDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      cy.log('Delivery ID:', deliveryId);
      cy.log('New shipping date:', shippingDate);

      css.updateShippingDate(deliveryId, shippingDate).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message', 'Updated');
      });
    });
  });

  it('Test 4: Change subscription frequency', () => {
    const subscriptionId = Cypress.env('cssConsumableSubId');
    expect(subscriptionId).to.exist;

    cy.log('Changing frequency for subscription:', subscriptionId);

    css.changeSubscriptionFrequency(subscriptionId, 'monthly', 1).then((response) => {
      cy.log('Response status:', response.status);
      cy.log('Response body:', JSON.stringify(response.body));

      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('message', 'Subscription frequency/interval changed.');
      cy.log('Response message:', response.body.message);
    });
  });

  it('Test 5: Perform bundle swap for a subscription', () => {
    const subscriptionId = Cypress.env('cssConsumableSubId');
    expect(subscriptionId).to.exist;

    css.getProductVariantIdFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const variantId = result[0].variant_id;

      css.bundleSwap(subscriptionId, String(variantId)).then((response) => {
        expect(response.status).to.eq(202);
        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message', 'Bundle swapped');
      });
    });
  });

  it('Test 6: Cancel a subscription', () => {
    const subscriptionId = Cypress.env('cssNormalSubId');
    expect(subscriptionId).to.exist;

    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const cancelPayload = {
      customer_email: 'c.test2489@gmail.com',
      cancellation_reason: 'Normal Cancellations',
      cancellation_type: 'normal_cancellation',
      early_cancellation: false,
      message: 'E2E test — cancel subscription',
      pickup: {
        delivery_date: futureDate,
        timeslot: { from: '08:00', to: '12:00' },
      },
    };

    css.cancelSubscription(subscriptionId, cancelPayload).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('message', 'Subscription cancelled, mail sent and note saved.');

      cy.log('Response message:', response.body.message);
    });
  });

  it('Test 7: Process buyout for a subscription with stripe payment', () => {
    css.getStripeBuyoutSubscriptionFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const subscriptionId = result[0].subscription_id;

      const buyoutPayload = {
        buyout_legal: [
          { tag: 'TermsAndConditions', value: true },
          { tag: 'newsletter', value: true },
        ],
      };

      css.processBuyout(subscriptionId, buyoutPayload).then((response) => {
        expect(response.status).to.eq(200);
        cy.log('Buyout response status:', response.status);
      });
    });
  });

  it('Test 8: Create order by customer', () => {
    css.getOrderVariantFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const data = result[0];

      const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const orderPayload = {
        send_to_shop: true,
        variant_id: String(data.variant_id),
        parent_order_id: String(data.parent_order_id),
        quantity: 2,
        subscription_type: 'consumable',
        subscription_frequency: 'monthly',
        subscription_frequency_interval: 1,
        subscription_start: futureStart,
      };

      css.createOrderByCustomer(orderPayload).then((response) => {
        expect(response.status).to.eq(201);
        expect(response.body.success).to.eq(true);
        expect(response.body).to.have.property('message', 'CREATED');
        expect(response.body).to.have.property('order_id');

        cy.log('New order ID:', response.body.order_id);
      });
    });
  });

});
