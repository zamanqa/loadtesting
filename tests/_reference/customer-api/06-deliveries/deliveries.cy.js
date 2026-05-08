import * as deliveries from "../../../support/customer-api/deliveries/deliveriesCommands";

describe('Deliveries API', () => {

  beforeEach(() => {
    deliveries.getShippingDateFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);

      const randomIndex = Math.floor(Math.random() * result.length);
      const shippingDate = result[randomIndex].shipping_date;

      cy.log('DB shipping dates available:', result.length);
      cy.log('Selected shipping date from DB:', shippingDate);

      Cypress.env('dbShippingDate', shippingDate);
    });
  });

  it('Test 1: Return a list of deliveries', () => {
    deliveries.getAllDeliveries().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array').and.have.length.greaterThan(0);

      cy.log('Total deliveries returned:', response.body.length);
      cy.log('First shipping date from API:', response.body[0]?.shipping_date);
    });
  });

  it('Test 2: Returns all deliveries for a shipping date and verify in DB', () => {
    const shippingDate = Cypress.env('dbShippingDate');
    expect(shippingDate).to.exist;

    cy.log('Querying deliveries for shipping date:', shippingDate);

    deliveries.getDeliveryByDate(shippingDate).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('shipping_date');

      cy.log('Fetched delivery for shipping date:', shippingDate);
    });

    deliveries.verifyDeliveryInDB(shippingDate);
  });

});
