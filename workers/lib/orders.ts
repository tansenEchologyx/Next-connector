/**
 * Order status helpers used by the unified sync job worker.
 */
import type { KornitxOrder } from "@prisma/client";
import { prisma } from "./prisma";

export async function markOrderProcessing(orderId: number) {
  return prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { status: "processing", failureReason: null },
  });
}

export async function markOrderReceivedForRetry(
  orderId: number,
  reason: string,
) {
  return prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { status: "received", failureReason: reason },
  });
}

export async function markOrderCreated(
  orderId: number,
  shopifyOrderId: string,
  lineItemMappings: Array<{ kornitxItemId: string; shopifyLineItemId: string }>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.kornitxOrder.update({
      where: { id: orderId },
      data: { status: "created", shopifyOrderId, failureReason: null },
    });

    for (const mapping of lineItemMappings) {
      await tx.kornitxOrderItem.updateMany({
        where: { orderId, itemId: mapping.kornitxItemId },
        data: { shopifyLineItemId: mapping.shopifyLineItemId },
      });
    }
  });
}

export async function markOrderFailed(orderId: number, reason: string) {
  return prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { status: "failed", failureReason: reason },
  });
}

export type ClaimedKornitxOrder = KornitxOrder & {
  items: import("@prisma/client").KornitxOrderItem[];
};

/** @deprecated Orders are claimed via SyncJob; kept for legacy worker script. */
export async function claimReceivedOrders(
  limit = 50,
): Promise<ClaimedKornitxOrder[]> {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.kornitxOrder.findMany({
      where: { status: "received" },
      orderBy: { orderReceivedAt: "asc" },
      take: limit,
      include: { items: true },
    });

    if (orders.length === 0) return [];

    await tx.kornitxOrder.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: "processing" },
    });

    return orders.map((o) => ({ ...o, status: "processing" }));
  });
}
