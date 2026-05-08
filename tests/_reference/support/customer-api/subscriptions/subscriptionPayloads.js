// Request payloads for Subscriptions module

export function getConsumableSubscriptionPayload(orderId, productId, id, subscriptionId, subscriptionType, subscriptionStart) {
  return {
    additional_infos: {},
    bundle_data: [],
    bundle_id: null,
    frame_number: null,
    id: id,
    is_bundle: false,
    is_parent: false,
    order_id: orderId,
    product_id: productId,
    serial_number: `SN-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`,
    status: 'active',
    subscription_extension_price: 100,
    subscription_id: subscriptionId,
    subscription_start: subscriptionStart,
    subscription_type: subscriptionType,
  };
}

export function getNormalBundleSubscriptionPayload(orderId, productId, id, subscriptionId, subscriptionType, subscriptionStart, pvId, pvShopVariantId, pvTitle) {
  const randomSerial = String(Math.floor(Math.random() * 900000000000) + 100000000000); // 12-digit
  return {
    additional_infos: {},
    bundle_data: [
      {
        id: pvId,
        serial_number: randomSerial,
        shop_variant_id: pvShopVariantId,
        title: pvTitle,
        frame_number: null,
      }
    ],
    bundle_id: null,
    frame_number: null,
    id: id,
    is_bundle: true,
    is_parent: false,
    order_id: orderId,
    product_id: productId,
    serial_number: null,
    status: 'active',
    subscription_extension_price: 100,
    subscription_id: subscriptionId,
    subscription_start: subscriptionStart,
    subscription_type: subscriptionType,
  };
}
