// DB queries for Draft Orders module

export function getSubscriptionProductVariantQuery(companyId) {
  return `
    SELECT
      pv.id AS variant_id,
      pv.product_id,
      pv.shop_variant_id,
      pv.sku,
      pv.title AS variant_name,
      pv.price,
      pv.frequency,
      pv.duration,
      pv.prepaid_duration,
      p.title AS product_name
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.company_id = '${companyId}'
      AND pv.subscription_item = true
      AND pv.active = true
      AND p.active = true
    ORDER BY pv.created_at DESC
    LIMIT 1
  `;
}

export function getLatestDraftOrderQuery(companyId) {
  return `
    SELECT id, draft_id, name, status, order_checkout_link, order_id, created_at
    FROM public.draft_orders
    WHERE company_id = '${companyId}'
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function verifyDraftOrderCreatedQuery(companyId, draftOrderId) {
  return `
    SELECT id, draft_id, status, order_checkout_link, created_at
    FROM public.draft_orders
    WHERE company_id = '${companyId}'
      AND id = '${draftOrderId}'
      AND deleted_at IS NULL
  `;
}

export function verifyDraftOrderDeletedQuery(draftOrderId) {
  return `
    SELECT draft_id, deleted_at
    FROM public.draft_orders
    WHERE draft_id = '${draftOrderId}'
      AND deleted_at IS NOT NULL
  `;
}
