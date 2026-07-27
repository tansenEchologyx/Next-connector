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

export async function handleOrderFulfilledWebhook(
  shop: string,
  payload: ShopifyOrderWebhookPayload,
) {
  const shopifyOrderId = orderGid(payload);
  if (!shopifyOrderId) {
    return { created: 0, reason: "missing_order_id" as const };
  }

  const kornitxOrder = await prisma.kornitxOrder.findFirst({
    where: { shopifyOrderId },
    include: { items: true },
  });

  if (!kornitxOrder) {
    return { created: 0, reason: "not_kornitx_order" as const };
  }

  let created = 0;

  if (kornitxOrder.orderShape === "single") {
    const result = await createShippingStatusEvent({
      shopifyOrderId,
      shopifyLineItemId: null,
      kornitxOrderId: kornitxOrder.id,
      kornitxItemId: kornitxOrder.items[0]?.itemId ?? null,
      status: "dispatched",
    });
    if (result.created) created += 1;
    await queueFulfillmentJobIfNeeded(shop, kornitxOrder, created);
    return { created, reason: "ok" as const };
  }

  for (const lineItem of payload.line_items ?? []) {
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
    include: { items: true },
  });

  if (!kornitxOrder) {
    return { created: 0, reason: "not_kornitx_order" as const };
  }

  let created = 0;

  if (kornitxOrder.orderShape === "single") {
    const result = await createShippingStatusEvent({
      shopifyOrderId,
      shopifyLineItemId: null,
      kornitxOrderId: kornitxOrder.id,
      kornitxItemId: kornitxOrder.items[0]?.itemId ?? null,
      status: "cancelled",
    });
    if (result.created) created += 1;
    await queueFulfillmentJobIfNeeded(shop, kornitxOrder, created);
    return { created, reason: "ok" as const };
  }

  for (const item of kornitxOrder.items) {
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
