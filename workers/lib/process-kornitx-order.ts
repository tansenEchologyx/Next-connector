import type { KornitxOrder, KornitxOrderItem } from "@prisma/client";

import { writeEventLog } from "../../app/models/event-log.server";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../../shared/event-log";
import { assertOrderSettings, loadAppSettings } from "./app-settings";
import { createShopifyOrderFromKornitx } from "./create-shopify-order";
import { markOrderCreated } from "./orders";
import { resolveOptionalCustomerShippingAddress } from "./resolve-shipping-address";
import { resolveWorkerShopSession } from "./shopify-session";

export async function processKornitxOrder(
  order: KornitxOrder & { items: KornitxOrderItem[] },
) {
  const { shop, accessToken } = await resolveWorkerShopSession();
  const settings = assertOrderSettings(await loadAppSettings(shop));
  const shippingAddress = await resolveOptionalCustomerShippingAddress(
    shop,
    accessToken,
    settings,
  );

  const result = await createShopifyOrderFromKornitx(
    shop,
    accessToken,
    settings,
    order,
    order.items,
    shippingAddress,
  );

  await markOrderCreated(
    order.id,
    result.shopifyOrderId,
    result.shopifyOrderName,
    result.lineItemMappings,
  );

  console.log(
    `[run-jobs] Created Shopify order ${result.shopifyOrderName} (${result.shopifyOrderId}) for KornitX ${order.kornitxId}`,
  );

  await writeEventLog({
    shop,
    level: EVENT_LOG_LEVELS.SUCCESS,
    category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
    eventName: "shopify_order_created",
    message: `Created Shopify order for KornitX order ${order.kornitxId}.`,
    kornitxOrderId: order.kornitxId,
    shopifyOrderId: result.shopifyOrderId,
    shopifyOrderName: result.shopifyOrderName,
  });

  return result;
}
