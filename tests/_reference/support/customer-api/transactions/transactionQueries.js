// DB queries for Transactions module

export function getTransactionByCompanyQuery(companyId) {
  return `
    SELECT t.id, t.transaction_id, t.invoice_number, t."type", t.status,
           t.amount_paid, t.order_id, t.subscription_id, t.customer_id,
           t.payment_method, t.currency_iso_code, t.created_at
    FROM public.transactions t
    WHERE t.company_id = '${companyId}'
    ORDER BY t.created_at DESC
    LIMIT 1
  `;
}

export function verifyTransactionByIdQuery(companyId, transactionId) {
  return `
    SELECT t.id, t.transaction_id, t.invoice_number, t."type", t.status,
           t.amount_paid, t.order_id, t.subscription_id, t.created_at
    FROM public.transactions t
    WHERE t.company_id = '${companyId}'
      AND t.transaction_id = '${transactionId}'
  `;
}
