// Request payloads for Payments module

export function getOneTimePaymentPayload(orderId) {
  return {
    amount: 20.0,
    order_id: orderId,
    message: "",
    products: [
      {
        product: "Automation test 1",
        amount: 10.0,
        tax_percent: 19,
        quantity: 1
      },
      {
        product: "Automation test 2",
        amount: 10.0,
        tax_percent: 19,
        quantity: 1
      }
    ]
  };
}
