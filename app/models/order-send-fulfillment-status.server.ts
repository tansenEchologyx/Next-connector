import prisma from "../db.server";
import { deriveSendFulfillmentStatus } from "../../shared/order-display";
import { SYNC_JOB_TYPES } from "../../shared/sync-job-types";

function sendFulfillmentKey(kornitxId: string): string {
  return `${SYNC_JOB_TYPES.SEND_FULFILLMENT}:order:${kornitxId}`;
}

/**
 * Recompute and persist `KornitxOrder.sendFulfillmentStatus` from shipping
 * events + the coalesced send_fulfillment SyncJob (same rules as the Orders UI).
 */
export async function refreshOrderSendFulfillmentStatus(orderId: number) {
  const order = await prisma.kornitxOrder.findUnique({
    where: { id: orderId },
    include: { shippingEvents: true },
  });

  if (!order) return null;

  const job = await prisma.syncJob.findUnique({
    where: { idempotencyKey: sendFulfillmentKey(order.kornitxId) },
    select: { status: true, lastError: true },
  });

  const { status } = deriveSendFulfillmentStatus(
    order.shippingEvents,
    job,
  );

  if (order.sendFulfillmentStatus === status) {
    return status;
  }

  await prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { sendFulfillmentStatus: status },
  });

  return status;
}
