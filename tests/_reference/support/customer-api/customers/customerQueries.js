// DB queries for Customers module

export function getCustomerIdQuery(companyId) {
  return `
    SELECT id, uid, first_name, last_name, email, phone, street, postal_code, city, country,
           company_id, created_at, updated_at, default_locale, external_customer_id,
           marketing_consent, meta, address_addition, debtor_id, alpha2, alpha3, region
    FROM public.customers
    WHERE company_id = '${companyId}'
    ORDER BY created_at ASC
    LIMIT 1
  `;
}

export function getCustomerByIdQuery(customerId) {
  return `SELECT * FROM public.customers WHERE uid = '${customerId}'`;
}

export function getCustomerAccountQuery(email) {
  return `
    SELECT id, referrer_email, amount, created_at, company_id, updated_at,
           remaining_amount, redeem, referrer_customer_id
    FROM public.customer_account
    WHERE referrer_email = '${email}'
  `;
}

export function checkExternalCustomerIdQuery(customerId) {
  return `SELECT external_customer_id FROM public.customers WHERE uid = '${customerId}'`;
}

export function checkCustomerExistsQuery(email) {
  return `SELECT * FROM public.customers WHERE email = LOWER('${email}')`;
}

export function deleteReferralByEmailQuery(email) {
  return `
    DELETE FROM checkout.checkout_voucher_codes
    WHERE referrer_email IN ('${email}')
  `;
}

export function getTwoRecentCustomersQuery(companyId) {
  return `
    SELECT c.uid, c.email, c.first_name, c.last_name
    FROM public.customers c
    WHERE c.company_id = '${companyId}'
      AND EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.order_customers oc
          ON oc.company_id = o.company_id
          AND oc.id = o.order_customer_id
        WHERE oc.customer_id = c.uid
          AND o.company_id = '${companyId}'
      )
    ORDER BY c.created_at DESC
    LIMIT 2
  `;
}

export function checkCustomerByUidQuery(uid) {
  return `SELECT uid, email FROM public.customers WHERE uid = '${uid}'`;
}

export function checkOrdersByCustomerQuery(customerUid, companyId) {
  return `
    SELECT COUNT(*) as count
    FROM public.orders o
    JOIN public.order_customers oc
      ON oc.company_id = o.company_id
      AND oc.id = o.order_customer_id
    WHERE o.company_id = '${companyId}'
      AND oc.customer_id = '${customerUid}'
  `;
}

export function deleteReferralCodeQuery(referralCode) {
  return `
    DELETE FROM checkout.checkout_voucher_codes
    WHERE voucher_code IN ('${referralCode}')
  `;
}
