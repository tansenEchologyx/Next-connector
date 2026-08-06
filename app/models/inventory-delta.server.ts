import prisma from "../db.server";

export async function upsertUnsentInventoryDelta(input: {
  shop: string;
  variantId: string;
  ean: string;
  quantity: number;
  inventoryItemId?: string;
}) {
  return prisma.inventoryDelta.upsert({
    where: {
      shop_ean: {
        shop: input.shop,
        ean: input.ean,
      },
    },
    create: {
      shop: input.shop,
      variantId: input.variantId,
      ean: input.ean,
      quantity: input.quantity,
      status: "unsent",
      inventoryItemId: input.inventoryItemId,
    },
    update: {
      variantId: input.variantId,
      quantity: input.quantity,
      status: "unsent",
      inventoryItemId: input.inventoryItemId,
    },
  });
}
