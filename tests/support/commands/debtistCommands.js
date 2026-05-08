// k6 write helpers for Debtist module
import { debtistRequest } from '../helpers/apiClient.js';

export function fileClaimForInvoice(invoiceId, token, companyId) {
  return debtistRequest('POST', `/debtist/invoice/${invoiceId}/claim`, token, companyId);
}
