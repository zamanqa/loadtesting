// DB queries for Invoices module

export function getInvoiceByCompanyQuery(companyId) {
  return `
    SELECT id, invoice_number, transaction_id, inc_per_company, company_id,
           created_at, updated_at, paid, "type", amount, currency
    FROM public.invoices
    WHERE company_id = '${companyId}'
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function getInvoiceByNumberQuery(invoiceNumber) {
  return `
    SELECT id, invoice_number, transaction_id, inc_per_company, company_id,
           created_at, updated_at, paid, "type", cancelled_invoice_id,
           original_invoice_id, amount, currency, total_tax_amount
    FROM public.invoices
    WHERE invoice_number = '${invoiceNumber}'
  `;
}

export function getUnpaidInvoiceQuery(companyId) {
  return `
    SELECT t.invoice_number
    FROM transactions t
    LEFT JOIN invoices i ON i.transaction_id = t.transaction_id AND i.company_id = t.company_id
    WHERE t.company_id IN ('${companyId}')
      AND t.transaction_id ILIKE '%TR_%'
      AND t.status NOT IN ('succeeded', 'in debt collection')
      AND i.paid = false
    ORDER BY t.created_at DESC
    LIMIT 1
  `;
}

export function getRefundableInvoiceQuery(companyId) {
  return `
    SELECT t.invoice_number, t.transaction_id
    FROM transactions t
    LEFT JOIN invoices i
      ON i.transaction_id = t.transaction_id
      AND i.company_id = t.company_id
    WHERE t.company_id IN ('${companyId}')
      AND t.transaction_id ILIKE '%pi_%'
      AND t.status IN ('succeeded')
      AND i.paid = true
      AND t.invoice_number IS NOT NULL
      AND t.refunded_transaction_id IS NULL
      AND invoice_type IN ('invoice')
    ORDER BY t.created_at DESC
    LIMIT 1
  `;
}

export function checkInvoicePaidQuery(invoiceNumber) {
  return `
    SELECT invoice_number, paid
    FROM public.invoices
    WHERE invoice_number = '${invoiceNumber}'
  `;
}

export function checkRefundedTransactionQuery(transactionId) {
  return `
    SELECT invoice_number, refunded_transaction_id, status
    FROM public.transactions
    WHERE refunded_transaction_id = '${transactionId}'
  `;
}
