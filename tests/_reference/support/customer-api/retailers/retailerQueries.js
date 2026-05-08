// DB queries for Retailers module

export function getRetailerByCompanyQuery(companyId) {
  return `
    SELECT id, location_id, name, enabled, created_at
    FROM public.retailers
    WHERE company_id = '${companyId}'
    ORDER BY created_at DESC
    LIMIT 1
  `;
}

export function verifyRetailerByIdQuery(companyId, retailerId) {
  return `
    SELECT id, location_id, name, enabled, created_at
    FROM public.retailers
    WHERE company_id = '${companyId}'
      AND retailer_id = '${retailerId}'
  `;
}

export function verifyRetailerByLocationIdQuery(companyId, locationId) {
  return `
    SELECT id, location_id, name, enabled, created_at
    FROM public.retailers
    WHERE company_id = '${companyId}'
      AND location_id = '${locationId}'
  `;
}
