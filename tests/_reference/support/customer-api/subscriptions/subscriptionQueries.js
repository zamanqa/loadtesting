// DB queries for Subscriptions module

export function getSubscriptionByCompanyQuery(companyId) {
  return `
    SELECT subscription_id, order_id, product_id, status, auto_renew,
           serial_number, real_end_date, subscription_type
    FROM public.subscriptions
    WHERE company_id = '${companyId}'
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function verifySubscriptionQuery(subscriptionId) {
  return `
    SELECT subscription_id, status, order_id, product_id
    FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
  `;
}

export function getConsumableOrderItemQuery(companyId) {
  return `
    SELECT
      oi.order_id,
      oi.order_item_id,
      oi.sku,
      oi.subscription_id,
      oi.subscription_type
    FROM order_items oi
    WHERE oi.company_id = '${companyId}'
      AND oi.subscription = true
      AND oi.is_bundle = false
      AND oi.bundle_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM subscriptions s
        WHERE s.subscription_id = oi.subscription_id
          AND s.company_id = oi.company_id
      )
    ORDER BY oi.created_at DESC
    LIMIT 1
  `;
}

export function getNormalBundleOrderItemQuery(companyId) {
  return `
    SELECT
      oi.order_id,
      oi.order_item_id,
      oi.sku,
      oi.subscription_id,
      oi.subscription_type,
      pv.id          AS pv_id,
      pv.shop_variant_id,
      pv.title       AS pv_title
    FROM order_items oi
    JOIN product_variants pv
      ON oi.sku = pv.shop_variant_id::text
      AND oi.bundle_id = pv.bundle_id
    WHERE oi.company_id = '${companyId}'
      AND oi.subscription = true
      AND oi.is_bundle = true
      AND oi.bundle_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM subscriptions s
        WHERE s.subscription_id = oi.subscription_id
          AND s.company_id = oi.company_id
      )
    ORDER BY oi.created_at DESC
    LIMIT 1
  `;
}

export function verifySubscriptionCreatedQuery(subscriptionId) {
  return `
    SELECT subscription_id, status, order_id, product_id, serial_number
    FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
  `;
}

export function deleteSubscriptionQuery(subscriptionId, companyId) {
  return `
    DELETE FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
      AND company_id = '${companyId}'
  `;
}

export function getActiveNormalSubscriptionQuery(companyId) {
  return `
    SELECT subscription_id
    FROM public.subscriptions
    WHERE company_id = '${companyId}'
      AND real_end_date IS NULL
      AND subscription_type = 'normal'
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function verifyRealEndDateQuery(subscriptionId) {
  return `
    SELECT subscription_id, real_end_date
    FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
  `;
}

export function verifySerialNumberQuery(subscriptionId) {
  return `
    SELECT subscription_id, serial_number
    FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
  `;
}

export function setSubscriptionStatusQuery(subscriptionId, status) {
  return `
    UPDATE public.subscriptions
    SET status = '${status}'
    WHERE subscription_id = '${subscriptionId}'
  `;
}

export function verifySubscriptionStatusQuery(subscriptionId) {
  return `
    SELECT subscription_id, status
    FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
  `;
}

export function verifyAutoRenewQuery(subscriptionId) {
  return `
    SELECT subscription_id, auto_renew
    FROM public.subscriptions
    WHERE subscription_id = '${subscriptionId}'
  `;
}
