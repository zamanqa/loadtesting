// Request payloads for Customers module

export function getCreateCustomerPayload() {
  const randomExternalId = Math.floor(1000 + Math.random() * 9000).toString();
  const randomEmail = `apiTest${Math.floor(Math.random() * 10000)}@gmail.com`;

  return {
    email: randomEmail,
    phone: "+4917656824720",
    default_locale: "en",
    marketing_consent: true,
    date_of_birth: null,
    first_name: "Shahiduz",
    last_name: "Zaman",
    company: "Circuly",
    street: "Fritz Tarnow Str 21",
    address_addition: "test",
    postal_code: "60320",
    city: "Frankfurt",
    "region":"",
    country: "Germany",
    external_customer_id: randomExternalId
  };
}

export function getValidateAddressPayload() {
  return {
    street: "Via Raffaele Conforti 124",
    postal_code: "00136",
    city: "Roma",
    region: "Roma",
    country: "IT"
  };
}

export function getMergeCustomersPayload(sourceCustomerId, targetCustomerId) {
  return {
    source_customer: sourceCustomerId,
    target_customer: targetCustomerId
  };
}
