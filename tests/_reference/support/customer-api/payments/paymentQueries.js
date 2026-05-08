// DB queries for Payments module

export function getPaymentEligibleOrderQuery(companyId) {
  return `
    SELECT order_id
    FROM orders
    WHERE payment_provider = 'stripe'
      AND payment_method_token = 'visa'
      AND status = 'open'
      AND transaction_id IS NOT NULL
      AND company_id = '${companyId}'
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function checkInvoiceCreatedForOrderQuery(orderId) {
  return `
    SELECT t.id, t.invoice_number, t."type", t.created_at
    FROM public.transactions t
    JOIN public.orders o ON o.company_id = t.company_id
    WHERE o.order_id = '${orderId}'
      AND t."type" IN ('one time payment')
    ORDER BY t.created_at DESC
    LIMIT 1
  `;
}
