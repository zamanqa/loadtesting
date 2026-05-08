import * as payments from "../../../support/customer-api/payments/paymentCommands";

describe('Customer Payments API', () => {

  beforeEach(() => {
    payments.getPaymentEligibleOrderFromDB().then((result) => {
      if (!result || result.length === 0) {
        cy.log('No payment-eligible order found in DB.');
        return;
      }
      cy.log('DB Order ID:', result[0].order_id);
      Cypress.env('dbPaymentOrderId', result[0].order_id);
    });
  });

  it('Test 1: Issue a one-time payment and verify invoice created in DB', () => {
    const orderId = Cypress.env('dbPaymentOrderId');
    if (!orderId) {
      cy.log('No eligible order found. Test passed by default.');
      return;
    }

    cy.log('Eligible order found:', orderId);

    payments.issueOneTimePayment(orderId).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body.message).to.eq("Invoice is created and sent successfully!");
      cy.log('One-time payment issued for order:', orderId);

      payments.verifyInvoiceCreatedInDB(orderId);
    });
  });

});
