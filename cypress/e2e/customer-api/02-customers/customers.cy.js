import * as customers from "../../../support/customer-api/customers/customerCommands";

describe('Customer API', () => {

  beforeEach(() => {
    customers.getCustomerIdFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      cy.log('DB Customer ID:', result[0].uid);
      Cypress.env('dbCustomerId', result[0].uid);
      Cypress.env('dbCustomerEmail', result[0].email);
    });
  });

  it('Test 1: Return a paginated list of customers', () => {
    customers.getAllCustomers().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Total Customers:', response.body.data.length);
    });
  });

  it('Test 2: Fetch customer by ID and verify in DB', () => {
    customers.getCustomerById(Cypress.env('dbCustomerId')).then((response) => {
      expect(response.status).to.eq(200);
      cy.log('Fetched Customer:', response.body);
    });

    customers.verifyCustomerInDB(Cypress.env('dbCustomerId'));
  });

  it('Test 3: Show customer balance', () => {
    customers.getCustomerBalance(Cypress.env('dbCustomerId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('remaining_amount');
      cy.log('Customer Balance:', response.body.remaining_amount);
    });
  });

  it('Test 4: Update customer balance and verify updated remaining_amount', () => {
    const amountToAdd = 100;

    customers.addCustomerBalance(Cypress.env('dbCustomerId'), amountToAdd).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('remaining_amount');
      cy.log('Updated Customer Balance:', response.body.remaining_amount);

      customers.getCustomerAccountFromDB(Cypress.env('dbCustomerEmail')).then((result) => {
        expect(result.length).to.be.greaterThan(0);
        cy.log('DB remaining_amount:', result[0].remaining_amount);
        expect(Number(result[0].remaining_amount)).to.eq(response.body.remaining_amount);
      });
    });
  });

  it('Test 5: Update customer external_customer_id and verify in DB', () => {
    const randomExternalId = Math.floor(1000 + Math.random() * 9000).toString();

    customers.updateCustomerExternalId(Cypress.env('dbCustomerId'), randomExternalId).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('message', 'Updated');
      cy.log('Updated external_customer_id to:', randomExternalId);
    });

    customers.verifyExternalCustomerIdInDB(Cypress.env('dbCustomerId'), randomExternalId);
  });

  it('Test 6: Delete existing referral and create referral code for customer', () => {
    customers.deleteReferralByEmail(Cypress.env('dbCustomerEmail'));

    customers.createCustomerReferralCode(Cypress.env('dbCustomerId')).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property('referral_code');

      Cypress.env('referralCode', response.body.referral_code);
      cy.log('Referral code created:', response.body.referral_code);
    });
  });

  it('Test 7: Get referral code and match with created one', () => {
    customers.getCustomerReferralCode(Cypress.env('dbCustomerId')).then((response) => {
      expect(response.status).to.eq(200);
      const fetchedCode = response.body.referral_code;
      expect(fetchedCode).to.eq(Cypress.env('referralCode'));
      cy.log('Referral code fetched:', fetchedCode);
    });
  });

  it('Test 8: Delete referral code from database for next run', () => {
    const codeToDelete = Cypress.env('referralCode');
    expect(codeToDelete).to.be.a('string').and.not.be.empty;

    customers.deleteReferralCodeFromDB(codeToDelete);
  });

  it('Test 9: Create a new customer and verify in DB', () => {
    customers.createCustomer().then((response) => {
      expect(response.status).to.eq(201);
      const createdEmail = Cypress.env('createdCustomerEmail');
      cy.log('Customer created with email:', createdEmail);

      customers.verifyCustomerExistsInDB(createdEmail);
    });
  });

  it('Test 10: Transfer (merge) two customers and verify in DB', () => {
    customers.getTwoRecentCustomersFromDB().then((result) => {
      if (!result || result.length < 2) {
        cy.log('Need at least 2 customers to transfer. Test passed by default.');
        return;
      }

      const sourceCustomerId = result[0].uid;
      const targetCustomerId = result[1].uid;
      cy.log('Source customer:', sourceCustomerId);
      cy.log('Target customer:', targetCustomerId);

      customers.transferCustomers(sourceCustomerId, targetCustomerId).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('message', 'Customer transferred successfully');
        cy.log('Customer transferred successfully');

        customers.verifyCustomerTransferredInDB(sourceCustomerId, targetCustomerId);
      });
    });
  });

  it('Test 11: Get customers by filter (paginated)', () => {
    customers.getCustomersByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered customers count:', response.body.data.length);
    });
  });

  it('Test 12: Get customers by search using DB customer ID', () => {
    customers.getCustomersBySearch(Cypress.env('dbCustomerId')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
