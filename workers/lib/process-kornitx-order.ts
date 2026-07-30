import type { KornitxOrder, KornitxOrderItem } from "@prisma/client";

import {
  loadAppSettings,
  validateOrderSettings,
} from "./app-settings";
import { createShopifyOrderFromKornitx } from "./create-shopify-order";
import { markOrderCreated } from "./orders";
import { resolveWorkerShopSession } from "./shopify-session";

export async function processKornitxOrder(
  order: KornitxOrder & { items: KornitxOrderItem[] },
) {
  const { shop, accessToken } = await resolveWorkerShopSession();
  const settings = await loadAppSettings(shop);
  const settingsError = validateOrderSettings(settings);
  if (settingsError || !settings) {
    throw new Error(settingsError ?? "App settings missing");
  }

  const result = await createShopifyOrderFromKornitx(
    shop,
    accessToken,
    settings,
    order,
    order.items,
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

  return result;
}
