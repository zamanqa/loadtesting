import * as productTracking from '../../../support/customer-api/product-tracking/productTrackingCommands';

describe('Customer Product Tracking API', () => {

  beforeEach(() => {
    productTracking.getProductTrackingFromDB().then((result) => {
      expect(result.length).to.be.greaterThan(0);
      const pt = result[0];

      cy.log('DB product tracking record found:');
      cy.log('Serial Number:', pt.serial_number);
      cy.log('Product Name:', pt.product_name);
      cy.log('Location Status:', pt.location_status);

      Cypress.env('dbSerialNumber', pt.serial_number);
    });

    productTracking.getActiveSubscriptionSerials().then((result) => {
      expect(result.length).to.be.greaterThan(0);

      const asset = result[0];
      cy.log('Active asset for repair test (Test 3):');
      cy.log('Serial Number:', asset.serial_number);
      Cypress.env('dbRepairSerial', asset.serial_number);
    });

    productTracking.getRepairSerialForStock().then((result) => {
      if (result.length > 0) {
        const asset = result[0];
        cy.log('Repair asset for stock test (Test 4):');
        cy.log('Serial Number:', asset.serial_number);
        Cypress.env('dbStockSerial', asset.serial_number);
      } else {
        cy.log('No "to repair" serial found for Test 4 — will rely on Test 3 repaired serial');
      }
    });
  });

  it('Test 1: Fetch all product tracking records and log details', () => {
    productTracking.getAllProductTracking().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');

      const data = response.body.data;
      expect(data).to.be.an('array').and.have.length.greaterThan(0);

      const first = data[0];
      cy.log('Total product tracking records returned:', data.length);
      cy.log('First Serial Number:', first.serial_number);
      cy.log('First Product Name:', first.product_name);
      cy.log('First Location Status:', first.location_status);
    });
  });

  it('Test 2: Fetch product tracking by serial number and verify in DB', () => {
    const serialNumber = Cypress.env('dbSerialNumber');
    expect(serialNumber).to.exist;

    productTracking.getProductTrackingBySerial(serialNumber).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('serial_number', serialNumber);

      cy.log('Fetched Serial Number:', response.body.serial_number);
      cy.log('Product Name:', response.body.product_name);
      cy.log('Location Status:', response.body.location_status);
    });

    productTracking.verifyProductTrackingInDB(serialNumber);
  });

  it('Test 3: Send repair request for product tracking', () => {
    const serialNumber = Cypress.env('dbRepairSerial');
    expect(serialNumber).to.exist;

    productTracking.postRepairRequest(serialNumber).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.eq('Updated');

      cy.log('Repair request successful for serial:', serialNumber);
    });

    productTracking.verifyLocationStatusInDB(serialNumber, 'to repair');
  });

  it('Test 4: Send stock request for product tracking', () => {
    const serialNumber = Cypress.env('dbStockSerial');
    expect(serialNumber, 'dbStockSerial must exist — needs a "to repair" asset in DB').to.exist;

    productTracking.postStockRequest(serialNumber).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body[0].success).to.be.true;
      expect(response.body[0].message).to.eq('Updated');

      cy.log('Stock request successful for serial:', serialNumber);
    });

    productTracking.verifyLocationStatusInDB(serialNumber, 'in stock');
  });

});
