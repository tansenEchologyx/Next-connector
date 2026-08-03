import prisma from "../db.server";
import { createShippingStatusEvent } from "../models/shipping-events.server";
import { enqueueSendFulfillmentJobIfNeeded } from "../models/sync-jobs.server";

type ShopifyLineItemPayload = {
  id?: number;
  admin_graphql_api_id?: string;
  fulfillment_status?: string | null;
};

type ShopifyOrderWebhookPayload = {
  admin_graphql_api_id?: string;
  id?: number;
  fulfillment_status?: string | null;
  line_items?: ShopifyLineItemPayload[];
  cancelled_at?: string | null;
};

function orderGid(payload: ShopifyOrderWebhookPayload): string | null {
  if (payload.admin_graphql_api_id) return payload.admin_graphql_api_id;
  if (payload.id !== undefined) return `gid://shopify/Order/${payload.id}`;
  return null;
}

function lineItemGid(lineItem: ShopifyLineItemPayload): string | null {
  if (lineItem.admin_graphql_api_id) return lineItem.admin_graphql_api_id;
  if (lineItem.id !== undefined) {
    return `gid://shopify/LineItem/${lineItem.id}`;
  }
  return null;
}

/** Normalize Shopify order.fulfillment_status for storage / UI. */
export function normalizeShopifyFulfillmentStatus(
  fulfillmentStatus: string | null | undefined,
  cancelledAt?: string | null,
): string {
  if (cancelledAt) return "cancelled";
  if (!fulfillmentStatus) return "unfulfilled";
  if (fulfillmentStatus === "partial") return "partial";
  if (fulfillmentStatus === "fulfilled") return "fulfilled";
  return fulfillmentStatus;
}

function isLineFulfilled(lineItem: ShopifyLineItemPayload): boolean {
  return lineItem.fulfillment_status === "fulfilled";
}

async function queueFulfillmentJobIfNeeded(
  shop: string,
  kornitxOrder: {
    id: number;
    kornitxId: string;
    orderReceivedAt: Date;
  },
  createdEvents: number,
) {
  if (createdEvents === 0) return;

  await enqueueSendFulfillmentJobIfNeeded(
    shop,
    kornitxOrder.id,
    kornitxOrder.kornitxId,
    kornitxOrder.orderReceivedAt,
  );
}

async function updateShopifyFulfillmentStatus(
  orderId: number,
  payload: ShopifyOrderWebhookPayload,
  forceCancelled = false,
) {
  const status = forceCancelled
    ? "cancelled"
    : normalizeShopifyFulfillmentStatus(
        payload.fulfillment_status,
        payload.cancelled_at,
      );

  await prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { shopifyFulfillmentStatus: status },
  });
}

/**
 * Shared handler for orders/fulfilled and orders/partially_fulfilled.
 * Creates dispatched ShippingStatusEvents only for lines Shopify marks fulfilled
 * (and for single-shape orders, one order-level dispatch). Dedupes existing events.
 */
export async function handleOrderFulfillmentWebhook(
  shop: string,
  payload: ShopifyOrderWebhookPayload,
) {
  const shopifyOrderId = orderGid(payload);
  if (!shopifyOrderId) {
    return { created: 0, reason: "missing_order_id" as const };
  }

  const kornitxOrder = await prisma.kornitxOrder.findFirst({
    where: { shopifyOrderId },
    include: { items: true, shippingEvents: true },
  });

  if (!kornitxOrder) {
    return { created: 0, reason: "not_kornitx_order" as const };
  }

  await updateShopifyFulfillmentStatus(kornitxOrder.id, payload);

  let created = 0;

  if (kornitxOrder.orderShape === "single") {
    const orderFulfilled =
      payload.fulfillment_status === "fulfilled" ||
      (payload.line_items ?? []).some(isLineFulfilled);

    if (orderFulfilled) {
      const result = await createShippingStatusEvent({
        shopifyOrderId,
        shopifyLineItemId: null,
        kornitxOrderId: kornitxOrder.id,
        kornitxItemId: kornitxOrder.items[0]?.itemId ?? null,
        status: "dispatched",
      });
      if (result.created) created += 1;
    }

    await queueFulfillmentJobIfNeeded(shop, kornitxOrder, created);
    return { created, reason: "ok" as const };
  }

  for (const lineItem of payload.line_items ?? []) {
    if (!isLineFulfilled(lineItem)) continue;

    const shopifyLineItemId = lineItemGid(lineItem);
    if (!shopifyLineItemId) continue;

    const matchedItem = kornitxOrder.items.find(
      (item) => item.shopifyLineItemId === shopifyLineItemId,
    );
    if (!matchedItem) continue;

    const result = await createShippingStatusEvent({
      shopifyOrderId,
      shopifyLineItemId,
      kornitxOrderId: kornitxOrder.id,
      kornitxItemId: matchedItem.itemId,
      status: "dispatched",
    });
    if (result.created) created += 1;
  }

  await queueFulfillmentJobIfNeeded(shop, kornitxOrder, created);

  return { created, reason: "ok" as const };
}

/** @deprecated Prefer handleOrderFulfillmentWebhook */
export async function handleOrderFulfilledWebhook(
  shop: string,
  payload: ShopifyOrderWebhookPayload,
) {
  return handleOrderFulfillmentWebhook(shop, payload);
}

export async function handleOrderCancelledWebhook(
  shop: string,
  payload: ShopifyOrderWebhookPayload,
) {
  const shopifyOrderId = orderGid(payload);
  if (!shopifyOrderId) {
    return { created: 0, reason: "missing_order_id" as const };
  }

  const kornitxOrder = await prisma.kornitxOrder.findFirst({
    where: { shopifyOrderId },
    include: { items: true, shippingEvents: true },
  });

  if (!kornitxOrder) {
    return { created: 0, reason: "not_kornitx_order" as const };
  }

  await updateShopifyFulfillmentStatus(kornitxOrder.id, payload, true);

  const dispatchedItemIds = new Set(
    kornitxOrder.shippingEvents
      .filter((event) => event.status === "dispatched")
      .map((event) => event.kornitxItemId)
      .filter((id): id is string => Boolean(id)),
  );

  let created = 0;

  if (kornitxOrder.orderShape === "single") {
    if (dispatchedItemIds.size === 0) {
      const result = await createShippingStatusEvent({
        shopifyOrderId,
        shopifyLineItemId: null,
        kornitxOrderId: kornitxOrder.id,
        kornitxItemId: kornitxOrder.items[0]?.itemId ?? null,
        status: "cancelled",
      });
      if (result.created) created += 1;
    }
    await queueFulfillmentJobIfNeeded(shop, kornitxOrder, created);
    return { created, reason: "ok" as const };
  }

  for (const item of kornitxOrder.items) {
    // Already dispatched to KornitX — do not also send cancel for that line.
    if (item.itemId && dispatchedItemIds.has(item.itemId)) continue;

    const alreadyDispatchedOnLine = kornitxOrder.shippingEvents.some(
      (event) =>
        event.status === "dispatched" &&
        event.shopifyLineItemId === item.shopifyLineItemId,
    );
    if (alreadyDispatchedOnLine) continue;

    const result = await createShippingStatusEvent({
      shopifyOrderId,
      shopifyLineItemId: item.shopifyLineItemId,
      kornitxOrderId: kornitxOrder.id,
      kornitxItemId: item.itemId,
      status: "cancelled",
    });
    if (result.created) created += 1;
  }

  await queueFulfillmentJobIfNeeded(shop, kornitxOrder, created);

  return { created, reason: "ok" as const };
}
