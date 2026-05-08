// DB queries for Recurring Payments module

export function getRecurringPaymentByCompanyQuery(companyId) {
  return `
    SELECT rp.id, rp.subscription_id, rp.billing_date, rp.status, rp.amount,
           rp.enabled, rp.payment_settled, rp.tries, rp.created_at
    FROM public.recurring_payments rp
    WHERE rp.company_id = '${companyId}'
      AND rp.deleted_at IS NULL
      AND rp.enabled = true
    ORDER BY rp.created_at DESC
    LIMIT 1
  `;
}

export function verifyRecurringPaymentByIdQuery(recurringPaymentId) {
  return `
    SELECT rp.id, rp.subscription_id, rp.billing_date, rp.status, rp.amount,
           rp.enabled, rp.payment_settled, rp.created_at
    FROM public.recurring_payments rp
    WHERE rp.id = ${recurringPaymentId}
  `;
}
