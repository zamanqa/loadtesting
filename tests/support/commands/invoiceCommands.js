// k6 write helpers for Invoices module
import { circulydbRequest } from '../helpers/apiClient.js';
import { getRefundPayload } from '../payloads/invoicePayloads.js';

export function settleInvoice(invoiceNumber, token, companyId) {
  return circulydbRequest('POST', `/invoices/${invoiceNumber}/settle`, token, companyId);
}

export function refundInvoice(invoiceNumber, token, companyId) {
  return circulydbRequest('POST', `/invoices/${invoiceNumber}/refund`, token, companyId, { body: getRefundPayload() });
}
