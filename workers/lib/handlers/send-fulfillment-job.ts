import type { SyncJob } from "@prisma/client";

import { enqueueSendFulfillmentJobIfNeeded } from "../../../app/models/sync-jobs.server";
import type { SendFulfillmentJobPayload } from "../../../shared/sync-job-types";
import {
  computeFulfillmentRunAfter,
  isFulfillmentSendDue,
} from "../../../shared/fulfillment-sync";
import { loadAppSettings } from "../app-settings";
import { sendShippingStatusesToKornitx } from "../kornitx-shipping";
import { prisma } from "../prisma";
import {
  completeSyncJob,
  failSyncJobWithBackoff,
  releaseSyncJobToPending,
} from "../sync-jobs";

type LegacySendFulfillmentJobPayload = {
  shippingStatusEventId?: number;
  kornitxOrderId?: number;
};

async function resolveKornitxOrderId(
  payload: SendFulfillmentJobPayload & LegacySendFulfillmentJobPayload,
): Promise<number> {
  if (payload.kornitxOrderId) {
    return payload.kornitxOrderId;
  }

  if (payload.shippingStatusEventId) {
    const event = await prisma.shippingStatusEvent.findUnique({
      where: { id: payload.shippingStatusEventId },
    });
    if (!event) {
      throw new Error(
        `Shipping status event ${payload.shippingStatusEventId} not found`,
      );
    }
    return event.kornitxOrderId;
  }

  throw new Error("Fulfillment job payload missing kornitxOrderId");
}

export async function handleSendFulfillmentJob(job: SyncJob) {
  const payload = job.payload as SendFulfillmentJobPayload &
    LegacySendFulfillmentJobPayload;
  const kornitxOrderId = await resolveKornitxOrderId(payload);

  const order = await prisma.kornitxOrder.findUnique({
    where: { id: kornitxOrderId },
  });

  if (!order) {
    throw new Error(`KornitX order ${kornitxOrderId} not found`);
  }

  if (!isFulfillmentSendDue(order.orderReceivedAt)) {
    const nextRunAt = computeFulfillmentRunAfter(order.orderReceivedAt);
    await releaseSyncJobToPending(
      job.id,
      nextRunAt,
      "Waiting for fulfillment delay after order received",
    );
    return { outcome: "deferred" as const, nextRunAt };
  }

  const unsent = await prisma.shippingStatusEvent.findMany({
    where: { kornitxOrderId: order.id, sent: false },
    orderBy: { id: "asc" },
  });

  if (unsent.length === 0) {
    await completeSyncJob(job.id);
    return { outcome: "nothing_to_send" as const };
  }

  const settings = await loadAppSettings(job.shop);

  try {
    await sendShippingStatusesToKornitx(settings, order, unsent);

    const now = new Date();
    await prisma.shippingStatusEvent.updateMany({
      where: { id: { in: unsent.map((event) => event.id) } },
      data: { sent: true, sentAt: now },
    });

    await completeSyncJob(job.id);

    const remaining = await prisma.shippingStatusEvent.count({
      where: { kornitxOrderId: order.id, sent: false },
    });

    if (remaining > 0) {
      await enqueueSendFulfillmentJobIfNeeded(
        job.shop,
        order.id,
        order.kornitxId,
        order.orderReceivedAt,
      );
    }

    console.log(
      `[run-jobs] Sent ${unsent.length} shipping status(es) to KornitX for order ${order.kornitxId} in one API call`,
    );

    return {
      outcome: "sent" as const,
      sentCount: unsent.length,
      remainingUnsent: remaining,
    };
  } catch (error) {
    await failSyncJobWithBackoff(job, error);
    return {
      outcome: "error" as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
