import * as debtist from '../../../support/customer-api/debtist/debtistCommands';

describe('Customer API - Debtist (Debt Collection)', () => {

  beforeEach(() => {
    debtist.getDebtistClaimFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const claim = result[0];

      cy.log('DB debtist claim found:');
      cy.log('Claim ID:', claim.claim_id);
      cy.log('Status:', claim.status);
      cy.log('Stage:', claim.stage);
      cy.log('Amount Due:', claim.original_amount_due);

      Cypress.env('dbDebtistClaimId', claim.claim_id);
      Cypress.env('dbDebtistInvoiceIds', claim.invoice_ids);
      Cypress.env('dbDebtistCustomerId', claim.customer_id);
    });
  });

  it('Test 1: Fetch claim by ID and verify against DB', () => {
    const claimId = Cypress.env('dbDebtistClaimId');
    expect(claimId).to.exist;

    debtist.getClaimById(claimId).then((response) => {
      expect(response.status).to.eq(200);

      cy.log('Claim ID:', response.body.claim_id || response.body.id);
      cy.log('Name:', response.body.name);
      cy.log('Status:', response.body.status);
    });

    debtist.verifyDebtistClaimInDB(claimId);
  });

  it('Test 2: Fetch claim by invoice ID', () => {
    const invoiceIds = Cypress.env('dbDebtistInvoiceIds');
    expect(invoiceIds).to.exist;

    const invoiceId = Array.isArray(invoiceIds) && invoiceIds.length > 0
      ? invoiceIds[0]
      : invoiceIds;
    expect(invoiceId).to.exist;

    debtist.getClaimByInvoice(invoiceId).then((response) => {
      expect(response.status).to.eq(200);

      cy.log('Claim response for invoice:', invoiceId);
      cy.log('Claim ID:', response.body.claim_id || response.body.id);
      cy.log('Status:', response.body.status);
    });
  });

  it('Test 3: File a claim for an invoice (with DB setup)', () => {
    debtist.getClaimableInvoiceFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const row = result[0];

      cy.log('Claimable invoice found:');
      cy.log('Invoice ID:', row.invoice_id);
      cy.log('Transaction ID:', row.transaction_id);

      debtist.prepareInvoiceForClaim(row.transaction_id).then(() => {
        cy.log('Invoice and transaction prepared successfully');

        debtist.fileClaimForInvoice(row.invoice_id).then((response) => {
          expect(response.status).to.be.oneOf([200, 201]);

          cy.log('Claim filed for invoice:', row.invoice_id);
          cy.log('Response body:', JSON.stringify(response.body));
        });
      });
    });
  });

  it('Test 4: Fetch debtist invoices', () => {
    debtist.getDebtistInvoices().then((response) => {
      expect(response.status).to.eq(200);

      const data = Array.isArray(response.body) ? response.body : response.body.data;
      expect(data).to.be.an('array');

      cy.log('Total debtist invoices:', data.length);
      if (data.length > 0) {
        cy.log('First Invoice ID:', data[0].id);
        cy.log('First Status:', data[0].status);
      }
    });
  });

  it('Test 5: Fetch debtist customers', () => {
    debtist.getDebtistCustomers().then((response) => {
      expect(response.status).to.eq(200);

      const data = Array.isArray(response.body) ? response.body : response.body.data;
      expect(data).to.be.an('array');

      cy.log('Total debtist customers:', data.length);
      if (data.length > 0) {
        cy.log('First Customer ID:', data[0].id);
        cy.log('First Customer name:', data[0].first_name);
      }
    });
  });

});
