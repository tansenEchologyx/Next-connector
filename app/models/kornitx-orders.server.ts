import prisma from "../db.server";
import { enqueueProcessOrderJob } from "./sync-jobs.server";

export async function listRecentOrders(limit = 50) {
  return prisma.kornitxOrder.findMany({
    orderBy: { orderReceivedAt: "desc" },
    take: limit,
    include: {
      items: true,
      _count: { select: { shippingEvents: true } },
    },
  });
}

export async function retryFailedOrder(shop: string, orderId: number) {
  const order = await prisma.kornitxOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "failed") {
    throw new Error("Only failed orders can be retried");
  }

  const updated = await prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { status: "received", failureReason: null },
  });

  await enqueueProcessOrderJob(shop, updated.id, updated.kornitxId);

  return updated;
}

export async function getOrderStatusCounts() {
  const groups = await prisma.kornitxOrder.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  return Object.fromEntries(
    groups.map((group) => [group.status, group._count.status]),
  ) as Record<string, number>;
}
