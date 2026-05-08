// DB queries for Debtist (Debt Collection) module

export function getDebtistClaimQuery(companyId) {
  return `
    SELECT id, claim_id, name, email, status, stage, title,
           customer_id, invoice_ids, subscription_ids, claim_type,
           original_amount_due, total_paid, total_pending,
           due_date, created_at
    FROM public.debtist_claims
    WHERE company_id = '${companyId}'
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function verifyDebtistClaimQuery(companyId, claimId) {
  return `
    SELECT id, claim_id, name, status, stage, original_amount_due
    FROM public.debtist_claims
    WHERE company_id = '${companyId}'
      AND claim_id = '${claimId}'
  `;
}

export function getClaimableInvoiceQuery(companyId) {
  return `
    SELECT i.id AS invoice_id, i.transaction_id, i.created_at AS invoice_created_at,
           i.updated_at AS invoice_updated_at, t.status AS transaction_status,
           t.collection_date, t.created_at AS transaction_created_at,
           t.updated_at AS transaction_updated_at
    FROM public.transactions t
    JOIN public.invoices i
      ON i.company_id = t.company_id
      AND i.transaction_id = t.transaction_id
    WHERE i.company_id = '${companyId}'
      AND i.paid = false
      AND i.claim_id IS NULL
      AND t.invoice_number IS NOT NULL
    ORDER BY i.created_at DESC
    LIMIT 1
  `;
}

export function prepareInvoiceForClaimQuery(companyId, transactionId) {
  const threeDaysAgo = "NOW() - INTERVAL '3 days'";
  return `
    WITH update_invoice AS (
      UPDATE public.invoices
      SET created_at = ${threeDaysAgo},
          updated_at = ${threeDaysAgo}
      WHERE company_id = '${companyId}'
        AND transaction_id = '${transactionId}'
    )
    UPDATE public.transactions
    SET status = 'failed',
        collection_date = ${threeDaysAgo},
        created_at = ${threeDaysAgo},
        updated_at = ${threeDaysAgo}
    WHERE company_id = '${companyId}'
      AND transaction_id = '${transactionId}'
  `;
}

export function verifyClaimCreatedForInvoiceQuery(companyId, invoiceId) {
  return `
    SELECT id, claim_id, status, stage, invoice_ids, created_at
    FROM public.debtist_claims
    WHERE company_id = '${companyId}'
      AND '${invoiceId}' = ANY(invoice_ids::text[])
    ORDER BY created_at DESC
    LIMIT 1
  `;
}
