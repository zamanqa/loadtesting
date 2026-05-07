import * as subscriptions from "../../../support/customer-api/subscriptions/subscriptionsCommands";
import dayjs from 'dayjs';

describe('Customer Subscriptions API', () => {

  beforeEach(() => {
    subscriptions.getSubscriptionFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const sub = result[0];
      cy.log('DB Subscription ID:', sub.subscription_id);
      Cypress.env('dbSubscriptionId', sub.subscription_id);
      Cypress.env('dbSubscriptionStatus', sub.status);
      Cypress.env('dbSubscriptionAutoRenew', sub.auto_renew);
    });
  });

  it('Test 1: Return a paginated list of subscriptions', () => {
    subscriptions.getCustomerSubscriptions().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.be.an('array').and.have.length.greaterThan(0);
      cy.log('Total subscriptions:', response.body.data.length);
    });
  });

  it('Test 2: Fetch subscription by ID and verify in DB', () => {
    const subscriptionId = Cypress.env('dbSubscriptionId');

    subscriptions.getSubscriptionById(subscriptionId).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Fetched subscription:', subscriptionId);
    });

    subscriptions.verifySubscriptionInDB(subscriptionId);
  });

  it('Test 3: Create a subscription and verify in DB', () => {
    subscriptions.getConsumableOrderItemFromDB().then((result) => {
      if (!result || result.length === 0) {
        cy.log('No eligible order item found. Test passed by default.');
        return;
      }

      const { order_id, order_item_id, sku, subscription_id, subscription_type } = result[0];
      const subscriptionStart = new Date().toISOString().split('T')[0];

      cy.log('Order ID:', order_id);
      cy.log('Subscription ID:', subscription_id);
      cy.log('Subscription Type:', subscription_type);

      const payload = subscriptions.getConsumableSubscriptionPayload(
        order_id, sku, order_item_id, subscription_id, subscription_type, subscriptionStart
      );

      subscriptions.createSubscription(payload).then((response) => {
        expect(response.status === 200 || response.status === 201).to.be.true;
        cy.log('Subscription created:', subscription_id);

        cy.wait(10000);

        subscriptions.verifySubscriptionCreatedInDB(subscription_id);
      });
    });
  });

  it('Test 4: Create a subscription (Normal + Bundle) and verify in DB', () => {
    subscriptions.getNormalBundleOrderItemFromDB().then((result) => {
      if (!result || result.length === 0) {
        cy.log('No eligible bundle order item found. Test passed by default.');
        return;
      }

      const { order_id, order_item_id, sku, subscription_id, subscription_type, pv_id, shop_variant_id, pv_title } = result[0];
      const subscriptionStart = new Date().toISOString().split('T')[0];

      cy.log('Order ID:', order_id);
      cy.log('Subscription ID:', subscription_id);
      cy.log('Bundle variant title:', pv_title);

      const payload = subscriptions.getNormalBundleSubscriptionPayload(
        order_id, sku, order_item_id, subscription_id, subscription_type, subscriptionStart,
        pv_id, shop_variant_id, pv_title
      );

      subscriptions.createSubscription(payload).then((response) => {
        expect(response.status === 200 || response.status === 201).to.be.true;
        cy.log('Subscription created:', subscription_id);

        cy.wait(10000);

        subscriptions.verifySubscriptionCreatedInDB(subscription_id);
      });
    });
  });

  it('Test 5: Update real_end_date and verify in DB', () => {
    subscriptions.getActiveNormalSubscriptionFromDB().then((result) => {
      if (!result || result.length === 0) {
        cy.log('No active normal subscription found. Test passed by default.');
        return;
      }

      const subscriptionId = result[0].subscription_id;
      const randomMonths = Math.floor(Math.random() * 6) + 5;
      const futureDate = dayjs().add(randomMonths, 'month').format('YYYY-MM-DD');

      cy.log('Subscription ID:', subscriptionId);
      cy.log('New value:', futureDate);

      subscriptions.updateSubscription(subscriptionId, { real_end_date: futureDate }).then((response) => {
        expect(response.status).to.eq(200);
        cy.log('Updated real_end_date to', futureDate);

        subscriptions.verifyRealEndDateInDB(subscriptionId);
      });
    });
  });

  it('Test 6: Update serial_number and verify in DB', () => {
    const subscriptionId = Cypress.env('dbSubscriptionId');
    const randomSerial = `serial-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    subscriptions.updateSubscription(subscriptionId, { serial_number: randomSerial }).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Updated serial_number to:', randomSerial);

      subscriptions.verifySerialNumberInDB(subscriptionId, randomSerial);
    });
  });

  it('Test 7: End subscription in DB and reactivate via API, verify in DB', () => {
    const subscriptionId = Cypress.env('dbSubscriptionId');

    subscriptions.setSubscriptionStatusInDB(subscriptionId, 'ended').then(() => {
      cy.log('DB update complete — status set to "ended"');

      subscriptions.reactivateSubscription(subscriptionId).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.be.true;
        expect(response.body.message).to.eq('Reactivated');
        cy.log('Reactivated subscription:', subscriptionId);

        subscriptions.verifySubscriptionStatusInDB(subscriptionId, 'active');
      });
    });
  });

  it('Test 8: Toggle auto_renew ON and verify in DB', () => {
    const subscriptionId = Cypress.env('dbSubscriptionId');

    subscriptions.toggleAutoRenew(subscriptionId, true).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.eq('Updated');
      cy.log('Auto-renew toggled ON for subscription:', subscriptionId);

      subscriptions.verifyAutoRenewInDB(subscriptionId, true);
    });
  });

  it('Test 9: Toggle auto_renew OFF and verify in DB', () => {
    const subscriptionId = Cypress.env('dbSubscriptionId');

    subscriptions.toggleAutoRenew(subscriptionId, false).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.eq('Updated');
      cy.log('Auto-renew toggled OFF for:', subscriptionId);

      subscriptions.verifyAutoRenewInDB(subscriptionId, false);
    });
  });

  it('Test 10: Get subscriptions by filter (paginated)', () => {
    subscriptions.getSubscriptionsByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered subscriptions count:', response.body.data.length);
    });
  });

  it('Test 11: Get subscriptions by search using DB subscription ID', () => {
    subscriptions.getSubscriptionsBySearch(Cypress.env('dbSubscriptionId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
