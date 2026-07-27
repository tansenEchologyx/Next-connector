import type { KornitxOrder } from "@prisma/client";

import prisma from "../db.server";
import type { ParsedKornitxOrder } from "../services/order.parser";
import { enqueueProcessOrderJob } from "./sync-jobs.server";

export async function saveInboundOrders(
  shop: string,
  orders: ParsedKornitxOrder[],
): Promise<KornitxOrder[]> {
  const saved: KornitxOrder[] = [];

  for (const order of orders) {
    saved.push(await saveInboundOrder(shop, order));
  }

  return saved;
}

export async function saveInboundOrder(
  shop: string,
  order: ParsedKornitxOrder,
): Promise<KornitxOrder> {
  const existing = await prisma.kornitxOrder.findUnique({
    where: { kornitxId: order.kornitxId },
  });

  if (existing) {
    if (existing.status === "failed") {
      const updated = await prisma.kornitxOrder.update({
        where: { id: existing.id },
        data: {
          status: "received",
          failureReason: null,
          orderReceivedAt: new Date(),
        },
      });
      await enqueueProcessOrderJob(shop, updated.id, updated.kornitxId);
      return updated;
    }

    return existing;
  }

  const created = await prisma.kornitxOrder.create({
    data: {
      kornitxId: order.kornitxId,
      brand: order.brand,
      destination: order.destination,
      currency: order.currency,
      dateTimeStamp: order.dateTimeStamp,
      orderShape: order.orderShape,
      status: "received",
      orderReceivedAt: new Date(),
      items: {
        create: order.items.map((item) => ({
          itemId: item.itemId,
          ean: item.ean,
          quantity: item.quantity,
          promiseDate: item.promiseDate,
          orderExternalRef: item.orderExternalRef,
        })),
      },
    },
  });

  await enqueueProcessOrderJob(shop, created.id, created.kornitxId);

  return created;
}
