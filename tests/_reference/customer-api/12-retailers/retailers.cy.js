import * as retailers from '../../../support/customer-api/retailers/retailerCommands';

describe('Customer API - Retailers', () => {

  beforeEach(() => {
    retailers.getRetailerFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const retailer = result[0];

      cy.log('DB retailer found:');
      cy.log('ID:', retailer.id);
      cy.log('Location ID:', retailer.location_id);
      cy.log('Name:', retailer.name);

      Cypress.env('dbRetailerId', retailer.id);
      Cypress.env('dbLocationId', retailer.location_id);
      Cypress.env('dbRetailerName', retailer.name);
    });
  });

  it('Test 1: Fetch all retailers and log details', () => {
    retailers.getAllRetailers().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data').and.to.be.an('array');

      const data = response.body.data;
      expect(data.length).to.be.greaterThan(0);

      cy.log('Total retailers returned:', data.length);
      cy.log('First ID:', data[0].id);
      cy.log('First Name:', data[0].name);
    });
  });

  it('Test 2: Fetch retailer by location_id and verify in DB', () => {
    const locationId = Cypress.env('dbLocationId');
    expect(locationId).to.exist;

    retailers.getRetailerByLocationId(locationId).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('location_id', locationId);

      cy.log('Fetched Location ID:', response.body.location_id);
      cy.log('Name:', response.body.name);
    });

    retailers.verifyRetailerByLocationIdInDB(locationId);
  });

  it('Test 3: Create a new retailer and verify in DB', () => {
    const uniqueSuffix = Date.now();
    const retailerData = {
      name: `Test Retailer ${uniqueSuffix}`,
      password: 'password',
      enabled: true,
      location_id: `retailer-${uniqueSuffix}`,
      address: {
        company: 'Circuly Test',
        street: 'Hansaallee 139',
        postal_code: '60320',
        city: 'Frankfurt',
        country: 'Germany',
        alpha2: 'DE',
      },
    };

    cy.log('Creating retailer with location_id:', retailerData.location_id);

    retailers.createRetailer(retailerData).then((response) => {
      expect(response.status).to.be.oneOf([200, 201]);
      const retailerId = response.body.id;
      expect(retailerId).to.exist;

      cy.log('Created Retailer ID:', retailerId);
      Cypress.env('createdRetailerId', retailerId);
    });

    cy.then(() => {
      const retailerId = Cypress.env('createdRetailerId');
      retailers.verifyRetailerInDB(retailerId);
    });
  });

  it('Test 4: Update retailer and verify in DB', () => {
    const retailerId = Cypress.env('createdRetailerId');
    expect(retailerId, 'createdRetailerId must be set by Test 3').to.exist;

    const updateData = {
      name: 'Updated Retailer',
      password: 'password',
      enabled: true,
      address: {
        company: 'Circuly Updated',
        street: 'Hansaallee 139',
        postal_code: '60320',
        city: 'Frankfurt',
        country: 'Germany',
        alpha2: 'DE',
      },
    };

    retailers.updateRetailer(retailerId, updateData).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('id');
      expect(response.body.name).to.eq('Updated Retailer');

      cy.log('Updated Retailer ID:', response.body.id);
    });

    retailers.verifyRetailerInDB(retailerId);
  });

  it('Test 5: Get retailers by filter (paginated)', () => {
    retailers.getRetailersByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered retailers count:', response.body.data.length);
    });
  });

  it('Test 6: Get retailers by search using DB retailer name', () => {
    retailers.getRetailersBySearch(Cypress.env('dbRetailerName')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
