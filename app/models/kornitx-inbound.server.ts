import type { KornitxOrder } from "@prisma/client";

import prisma from "../db.server";
import type { ParsedKornitxOrder } from "../services/order.parser";
import { writeEventLog } from "./event-log.server";
import { enqueueProcessOrderJob } from "./sync-jobs.server";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../../shared/event-log";

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
      await writeEventLog({
        shop,
        level: EVENT_LOG_LEVELS.WARN,
        category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
        eventName: "kornitx_order_reingested",
        message: `Previously failed order ${order.kornitxId} re-received from KornitX and re-queued.`,
        kornitxOrderId: order.kornitxId,
      });
      return updated;
    }

    await writeEventLog({
      shop,
      level: EVENT_LOG_LEVELS.INFO,
      category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
      eventName: "kornitx_order_duplicate_ignored",
      message: `Duplicate KornitX order ${order.kornitxId} ignored (already ${existing.status}).`,
      kornitxOrderId: order.kornitxId,
    });
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

  await writeEventLog({
    shop,
    level: EVENT_LOG_LEVELS.SUCCESS,
    category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
    eventName: "kornitx_order_received",
    message: `Order ${created.kornitxId} received from KornitX and queued for Shopify creation.`,
    kornitxOrderId: created.kornitxId,
  });

  return created;
}
