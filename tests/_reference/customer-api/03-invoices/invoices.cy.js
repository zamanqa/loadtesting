import * as invoices from "../../../support/customer-api/invoices/invoiceCommands";

describe('Customer Invoices API', () => {

  beforeEach(() => {
    invoices.getInvoiceFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      cy.log('DB Invoice Number:', result[0].invoice_number);
      Cypress.env('dbInvoiceNumber', result[0].invoice_number);
      Cypress.env('dbInvoiceId', result[0].id);
    });
  });

  it('Test 1: Return a paginated list of invoices', () => {
    invoices.getCustomerInvoices().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.be.an('array').and.have.length.greaterThan(0);
      cy.log('Total Invoices:', response.body.data.length);
    });
  });

  it('Test 2: Fetch invoice by ID and verify in DB', () => {
    invoices.getInvoiceById(Cypress.env('dbInvoiceNumber')).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Fetched Invoice:', Cypress.env('dbInvoiceNumber'));
    });

    invoices.verifyInvoiceInDB(Cypress.env('dbInvoiceNumber'));
  });

  it('Test 3: Settle the latest unpaid invoice and verify paid in DB', () => {
    invoices.getUnpaidInvoiceFromDB().then((result) => {
      if (!result || !result[0] || !result[0].invoice_number) {
        cy.log('No unpaid invoice found. Test passed by default.');
        return;
      }

      const invoiceNumber = result[0].invoice_number;
      cy.log('Settling Invoice:', invoiceNumber);

      invoices.settleInvoice(invoiceNumber).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('message', 'Invoice is settled successfully!');
        cy.log('Invoice settled:', invoiceNumber);

        invoices.verifyInvoicePaidInDB(invoiceNumber);
      });
    });
  });

  it('Test 4: Refund the latest paid invoice and verify in DB', () => {
    invoices.getRefundableInvoiceFromDB().then((result) => {
      if (!result || result.length === 0) {
        cy.log('No eligible invoice found for refund. Test passed by default.');
        return;
      }

      const invoiceNumber = result[0].invoice_number;
      const transactionId = result[0].transaction_id;
      cy.log('Eligible invoice found:', invoiceNumber);

      invoices.refundInvoice(invoiceNumber).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('message', 'Refund Payment Success');
        cy.log('Invoice refunded:', invoiceNumber);

        invoices.verifyRefundInDB(transactionId);
      });
    });
  });

  it('Test 5: Get invoices by filter (paginated)', () => {
    invoices.getInvoicesByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered invoices count:', response.body.data.length);
    });
  });

  it('Test 6: Get invoices by search using DB invoice number', () => {
    invoices.getInvoicesBySearch(Cypress.env('dbInvoiceNumber')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});

