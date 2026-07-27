import prisma from "../db.server";

export type VariantToTrack = {
  variantId: string;
  ean: string;
  sku: string | null;
  productTitle: string;
};

export async function getTrackedVariantIds(shop: string): Promise<Set<string>> {
  const rows = await prisma.trackedProduct.findMany({
    where: { shop, enabled: true },
    select: { variantId: true },
  });
  return new Set(rows.map((row) => row.variantId));
}

export async function syncTrackedProducts(
  shop: string,
  selectedVariants: VariantToTrack[],
) {
  const selectedIds = new Set(selectedVariants.map((variant) => variant.variantId));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.trackedProduct.findMany({ where: { shop } });

    for (const row of existing) {
      const shouldEnable = selectedIds.has(row.variantId);
      if (row.enabled !== shouldEnable) {
        await tx.trackedProduct.update({
          where: { id: row.id },
          data: { enabled: shouldEnable },
        });
      }
    }

    for (const variant of selectedVariants) {
      const tracked = await tx.trackedProduct.upsert({
        where: {
          shop_variantId: { shop, variantId: variant.variantId },
        },
        create: {
          shop,
          variantId: variant.variantId,
          ean: variant.ean,
          sku: variant.sku,
          productTitle: variant.productTitle,
          enabled: true,
        },
        update: {
          ean: variant.ean,
          sku: variant.sku,
          productTitle: variant.productTitle,
          enabled: true,
        },
      });

      await tx.inventorySyncState.upsert({
        where: { trackedProductId: tracked.id },
        create: {
          trackedProductId: tracked.id,
          pendingQuantity: 0,
          lastChangedAt: new Date(),
          needsSync: false,
        },
        update: {},
      });
    }
  });
}
