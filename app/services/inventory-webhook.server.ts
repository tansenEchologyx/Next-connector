import prisma from "../db.server";
import { upsertUnsentInventoryDelta } from "../models/inventory-delta.server";
import { enqueueSendInventoryDeltaJobIfNeeded } from "../models/sync-jobs.server";
import {
  getOfflineAccessToken,
  lookupVariantByInventoryItemId,
} from "./shopify-offline.server";

type InventoryLevelsUpdatePayload = {
  inventory_item_id?: number;
  available?: number | null;
};

export async function handleInventoryLevelsUpdate(
  shop: string,
  payload: InventoryLevelsUpdatePayload,
) {
  const inventoryItemId = payload.inventory_item_id;
  if (inventoryItemId === undefined) {
    console.warn("[inventory/levels_update] Missing inventory_item_id");
    return { stored: false as const, reason: "missing_inventory_item_id" };
  }

  const available = payload.available;
  if (available === undefined || available === null) {
    console.warn("[inventory/levels_update] Missing available quantity");
    return { stored: false as const, reason: "missing_available" };
  }

  const accessToken = await getOfflineAccessToken(shop);
  const variant = await lookupVariantByInventoryItemId(
    shop,
    accessToken,
    inventoryItemId,
  );

  if (!variant?.barcode) {
    return { stored: false as const, reason: "variant_not_found" };
  }

  const tracked = await prisma.trackedProduct.findFirst({
    where: {
      shop,
      variantId: variant.id,
      enabled: true,
    },
  });

  if (!tracked) {
    return { stored: false as const, reason: "not_tracked" };
  }

  await upsertUnsentInventoryDelta({
    shop,
    variantId: variant.id,
    ean: tracked.ean,
    quantity: available,
    inventoryItemId: String(inventoryItemId),
  });

  await enqueueSendInventoryDeltaJobIfNeeded(shop);

  return { stored: true as const, ean: tracked.ean, quantity: available };
}
