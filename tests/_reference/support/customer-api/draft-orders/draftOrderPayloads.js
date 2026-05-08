import dayjs from 'dayjs';

export function getDraftOrderPayload(productId, variantId, sku, shopVariantId, price, productName) {
  const today = dayjs();
  const subscriptionStart = today.format('YYYY-MM-DD');
  const subscriptionEnd = today.add(1, 'month').format('YYYY-MM-DD');

  return {
    remarks: '',
    charge_by_invoice: false,
    customer: {
      email: `e2e-test+${Date.now()}@circuly.io`,
      phone: '+4928388',
      vat_number: '',
      external_customer_id: `e2e-${Date.now()}`,
      default_locale: 'de',
      date_of_birth: null,
      marketing_consent: false,
      billing: {
        address_addition: '12',
        alpha2: 'de',
        alpha3: '',
        city: 'Frankfurt am Main',
        company: '',
        country: 'Germany',
        first_name: 'E2E',
        last_name: 'Test',
        note: '',
        postal_code: '60320',
        region: null,
        street: 'Fritz Str.',
        street_number: '21',
      },
      shipping: {
        address_addition: '12',
        alpha2: 'de',
        alpha3: '',
        city: 'Frankfurt am Main',
        company: '',
        country: 'Germany',
        first_name: 'E2E',
        last_name: 'Test',
        note: '',
        postal_code: '60320',
        region: null,
        street: 'Fritz Str.',
        street_number: '21',
      },
    },
    items: [
      {
        discount_amount: 0,
        expected_revenue: 0,
        name: productName,
        price: Number(price),
        product_id: productId,
        quantity: 1,
        sku: String(shopVariantId),
        sku_name: sku,
        subscription: true,
        subscription_duration: 1,
        subscription_duration_prepaid: 1,
        subscription_end: subscriptionEnd,
        subscription_frequency: 'monthly',
        subscription_frequency_interval: 1,
        subscription_start: subscriptionStart,
        subscription_type: 'normal',
        thumbnail: '',
        variant_id: variantId,
        voucher_code: null,
        shop_variant_id: String(shopVariantId),
      },
    ],
  };
}
