// DB queries for Product Tracking module

export function getProductTrackingByCompanyQuery(companyId) {
  return `
    SELECT pt.id, pt.serial_number, pt.product_name, pt.sku, pt.location_status,
           pt.location, pt.subscription_id, pt.customer_id, pt.customer_name,
           pt.cost, pt.purchase_price, pt.blocked, pt.created_at
    FROM public.product_trackings pt
    WHERE pt.company_id = '${companyId}'
      AND pt.location_status = 'rented out'
    ORDER BY pt.created_at DESC
    LIMIT 1
  `;
}

export function getActiveSubscriptionSerialsQuery(companyId) {
  return `
    SELECT pt.serial_number, pt.location_status, pt.product_name, pt.subscription_id,
           s.status AS subscription_status
    FROM public.product_trackings pt
    JOIN public.subscriptions s
      ON s.subscription_id = pt.subscription_id
      AND s.company_id = pt.company_id
      AND s.status = 'active'
    WHERE pt.company_id = '${companyId}'
      AND pt.location_status = 'rented out'
      AND pt.serial_number IS NOT NULL
      AND pt.serial_number != ''
      AND pt.subscription_id IS NOT NULL
    ORDER BY pt.created_at DESC
    LIMIT 1
  `;
}

export function getRepairSerialForStockQuery(companyId) {
  return `
    SELECT pt.serial_number, pt.location_status, pt.product_name, pt.subscription_id
    FROM public.product_trackings pt
    WHERE pt.company_id = '${companyId}'
      AND pt.location_status IN ('to repair')
      AND pt.serial_number IS NOT NULL
      AND pt.serial_number != ''
    ORDER BY pt.updated_at DESC
    LIMIT 1
  `;
}

export function verifyProductTrackingBySerialQuery(companyId, serialNumber) {
  return `
    SELECT pt.id, pt.serial_number, pt.product_name, pt.sku, pt.location_status,
           pt.location, pt.subscription_id, pt.customer_id, pt.customer_name,
           pt.blocked, pt.created_at
    FROM public.product_trackings pt
    WHERE pt.company_id = '${companyId}'
      AND pt.serial_number = '${serialNumber}'
  `;
}

export function verifyLocationStatusQuery(companyId, serialNumber) {
  return `
    SELECT pt.serial_number, pt.location_status, pt.location, pt.updated_at
    FROM public.product_trackings pt
    WHERE pt.company_id = '${companyId}'
      AND pt.serial_number = '${serialNumber}'
    ORDER BY pt.updated_at DESC
    LIMIT 1
  `;
}
