// DB queries for Orders module

export function checkOrderExistsQuery(orderId) {
  return `SELECT * FROM orders WHERE order_id = '${orderId}'`;
}

export function checkOrderItemExistsQuery(orderId) {
  return `SELECT * FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_id = '${orderId}')`;
}

export function getOrderIdQuery(companyId) {
  return `
    SELECT
      o.order_id,
      o.company_id,
      o.payment_provider,
      o.payment_method_token,
      o.status,
      o.transaction_id,
      o.payment_status,
      o.origin,
      o.shipping_method,
      o.subscription_type,
      o.replace_order_id,
      o.parent_id,
      o.order_customer_id
    FROM orders o
    LEFT JOIN subscriptions s ON o.order_id = s.order_id AND o.company_id = s.company_id
    WHERE o.company_id IN ('${companyId}')
      AND s.order_id IS NULL
      AND o.payment_method_token = 'visa'
      AND o.status = 'open'
      AND o.origin = 'checkout'
    ORDER BY o.created_at DESC
    LIMIT 1
  `;
}

export function getOrderStatusQuery(orderId) {
  return `SELECT order_id, status FROM orders WHERE order_id = '${orderId}'`;
}

export function getChargeableOrderIdQuery(companyId) {
  return `
    SELECT o.order_id, o.payment_status, o.status, o.payment_provider, o.transaction_id, o.origin
    FROM orders o
    WHERE o.company_id = '${companyId}'
      AND o.payment_status IN ('payment_required')
      AND o.status IN ('open')
      AND o.payment_provider IN ('stripe')
      AND o.origin IN ('cms')
    ORDER BY o.created_at DESC
    LIMIT 1
  `;
}

export function getInvoiceableOrderIdQuery(companyId) {
  return `
    SELECT o.order_id, o.payment_status, o.status, o.payment_provider,
           o.transaction_id, o.origin, t.initial_invoice, t.invoice_number
    FROM orders o
    JOIN transactions t
      ON t.order_id = o.order_id AND t.company_id = o.company_id
    WHERE o.company_id = '${companyId}'
      AND o.payment_status IN ('pending')
      AND o.transaction_id IS NOT NULL
      AND t.initial_invoice = true
    ORDER BY o.created_at DESC
    LIMIT 1
  `;
}

export function deleteStaleJobsQuery() {
  return `
    DELETE FROM public.jobs
    WHERE queue IN ('customers_api')
      AND attempts = 0
  `;
}

export function disableAllCronsQuery() {
  return `
    UPDATE public.cms_crons
    SET active = false, running = false
  `;
}

export function enableSpecificCronsQuery() {
  return `
    UPDATE public.cms_crons
    SET active = true
    WHERE command IN (
      'php artisan queue:work --stop-when-empty --max-jobs=1000 --max-time=3000'
    )
  `;
}

export function resetAllCronsQuery() {
  return `
    UPDATE public.cms_crons
    SET active = false, running = false
  `;
}
