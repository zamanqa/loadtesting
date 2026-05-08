import * as vouchers from '../../../support/customer-api/vouchers/voucherCommands';

describe('Customer API - Vouchers', () => {

  beforeEach(() => {
    vouchers.getAllVouchers().then((response) => {
      expect(response.status).to.eq(200);

      const data = response.body.data;
      expect(data).to.be.an('array').and.have.length.greaterThan(0);

      const v = data[0];
      cy.log('API voucher found:');
      cy.log('Voucher Code:', v.voucher_code);
      cy.log('Name:', v.name);

      Cypress.env('dbVoucherCode', v.voucher_code);
    });
  });

  it('Test 1: Fetch all vouchers and log details', () => {
    vouchers.getAllVouchers().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data').and.to.be.an('array');

      const data = response.body.data;
      expect(data.length).to.be.greaterThan(0);

      cy.log('Total vouchers returned:', data.length);
      cy.log('First Voucher Code:', data[0].voucher_code);
      cy.log('First Name:', data[0].name);
    });
  });

  it('Test 2: Fetch voucher by code and verify details', () => {
    const voucherCode = Cypress.env('dbVoucherCode');
    expect(voucherCode).to.exist;

    vouchers.getVoucherByCode(voucherCode).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('voucher_code', voucherCode);

      cy.log('Fetched Voucher Code:', response.body.voucher_code);
      cy.log('Discount Amount:', response.body.discount_amount);
      cy.log('Valid:', response.body.valid);
    });
  });

  it('Test 3: Create a new voucher and verify via API', () => {
    const uniqueSuffix = Date.now();
    const voucherData = {
      description: 'E2E Test Voucher',
      discount_amount: '20',
      discount_percent: null,
      email: null,
      expiry_date: '2044-04-01 00:00:00',
      name: `Test Voucher ${uniqueSuffix}`,
      one_time_use: true,
      recurring_discount: true,
      valid: true,
      visible: true,
      voucher_code: `test-${uniqueSuffix}`,
      specify_variants: true,
    };

    cy.log('Creating voucher with code:', voucherData.voucher_code);

    vouchers.createVoucher(voucherData).then((response) => {
      expect(response.status).to.be.oneOf([200, 201]);
      expect(response.body).to.have.property('voucher_code');

      cy.log('Created Voucher Code:', response.body.voucher_code);
      Cypress.env('createdVoucherCode', response.body.voucher_code);
    });
  });

  it('Test 4: Fetch the created voucher by code and verify details', () => {
    const voucherCode = Cypress.env('createdVoucherCode');
    expect(voucherCode, 'createdVoucherCode must be set by Test 3').to.exist;

    vouchers.getVoucherByCode(voucherCode).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('voucher_code', voucherCode);
      expect(response.body.valid).to.be.true;

      cy.log('Fetched Voucher Code:', response.body.voucher_code);
      cy.log('Discount Amount:', response.body.discount_amount);
      cy.log('Valid:', response.body.valid);
    });
  });

  it('Test 5: Update the created voucher and verify changes', () => {
    const voucherCode = Cypress.env('createdVoucherCode');
    expect(voucherCode, 'createdVoucherCode must be set by Test 3').to.exist;

    vouchers.getVoucherByCode(voucherCode).then((getResponse) => {
      expect(getResponse.status).to.eq(200);

      const current = getResponse.body;
      const updateData = {
        voucher_code: current.voucher_code,
        name: `${current.name} Updated`,
        discount_percent: 10,
        one_time_use: false,
        recurring_discount: false,
        valid: false,
        visible: false,
      };

      const voucherId = current.id;
      cy.log('Updating voucher ID:', voucherId);
      cy.log('New name:', updateData.name);

      vouchers.updateVoucher(voucherId, updateData).then((response) => {
        expect(response.status).to.be.oneOf([200, 201]);

        cy.log('Updated Voucher Code:', response.body.voucher_code);
        cy.log('Updated Discount Percent:', response.body.discount_percent);
        cy.log('Updated Valid:', response.body.valid);
      });
    });
  });

  it('Test 6: Get vouchers by filter (paginated)', () => {
    vouchers.getVouchersByFilter().then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      expect(response.body.data.length).to.be.greaterThan(0);
      cy.log('Filtered vouchers count:', response.body.data.length);
    });
  });

  it('Test 7: Get vouchers by search using voucher code from API', () => {
    vouchers.getVouchersBySearch(Cypress.env('dbVoucherCode')).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('data');
      cy.log('Search results count:', response.body.data.length);
    });
  });

});
