import * as transactions from '../../../support/customer-api/transactions/transactionsCommands';

describe('Customer Transactions API', () => {

  beforeEach(() => {
    transactions.getTransactionFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const txn = result[0];

      cy.log('DB transaction found:');
      cy.log('Transaction ID:', txn.transaction_id);
      cy.log('Type:', txn.type);
      cy.log('Status:', txn.status);

      Cypress.env('dbTransactionId', txn.transaction_id);
    });
  });

  it('Test 1: Fetch all transactions and log details', () => {
    transactions.getCustomerTransactions().then((response) => {
      expect(response.status).to.eq(200);

      const data = response.body.data;
      expect(data).to.be.an('array').and.have.length.greaterThan(0);

      const first = data[0];
      cy.log('Total transactions returned:', data.length);
      cy.log('First Transaction ID:', first.transaction_id || first.id);
      cy.log('First Type:', first.type);
      cy.log('First Status:', first.status);
    });
  });

  it('Test 2: Fetch single transaction by ID and verify in DB', () => {
    const transactionId = Cypress.env('dbTransactionId');
    expect(transactionId).to.exist;

    transactions.getTransactionById(transactionId).then((response) => {
      expect(response.status).to.eq(200);

      const txn = response.body;
      cy.log('Fetched Transaction ID:', txn.transaction_id || txn.id);
      cy.log('Type:', txn.type);
      cy.log('Status:', txn.status);
    });

    transactions.verifyTransactionInDB(transactionId);
  });

  it('Test 3: Get transactions by filter (paginated)', () => {
    transactions.getTransactionsByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered transactions count:', response.body.data.length);
    });
  });

  it('Test 4: Get transactions by search using DB transaction ID', () => {
    transactions.getTransactionsBySearch(Cypress.env('dbTransactionId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
