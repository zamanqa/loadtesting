// Request payloads for Invoices module

export function getRefundPayload() {
  return {
    amount: 0.50,
    cumulated_items: [],
    full_refund: true,
    items: [],
    message: "",
    products: []
  };
}
