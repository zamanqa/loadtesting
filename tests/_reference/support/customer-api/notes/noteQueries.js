// DB queries for Notes module

export function getNoteByCompanyQuery(companyId) {
  return `
    SELECT id, author, customer_id, order_id, subscription_id, transaction_id,
           message, pinned, title, subtitle, description, serial_number,
           created_at, updated_at
    FROM public.notes
    WHERE company_id = '${companyId}'
      AND order_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function getNoteBySubscriptionQuery(companyId) {
  return `
    SELECT id, author, customer_id, subscription_id, message, title, created_at
    FROM public.notes
    WHERE company_id = '${companyId}'
      AND subscription_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function getNoteByTransactionQuery(companyId) {
  return `
    SELECT id, author, transaction_id, message, title, created_at
    FROM public.notes
    WHERE company_id = '${companyId}'
      AND transaction_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
}
