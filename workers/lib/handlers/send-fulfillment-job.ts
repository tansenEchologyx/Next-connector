import type { SyncJob } from "@prisma/client";

import {
  ISSUE_SOURCES,
  ISSUE_TYPES,
  resolveOrderIssuesBySource,
  upsertOpenOrderIssue,
} from "../../../app/models/kornitx-order-issues.server";
import { isConfigurationError } from "../../../shared/configuration-error";
import {
  buildFulfillmentConfigFailureMessage,
  buildFulfillmentSendRetryWarningMessage,
} from "../../../shared/order-processing-issues";
import { refreshOrderSendFulfillmentStatus } from "../../../app/models/order-send-fulfillment-status.server";
import { writeEventLog } from "../../../app/models/event-log.server";
import { enqueueSendFulfillmentJobIfNeeded } from "../../../app/models/sync-jobs.server";
import type { SendFulfillmentJobPayload } from "../../../shared/sync-job-types";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../../../shared/event-log";
import { formatUkDateTime } from "../../../shared/uk-time";
import {
  computeFulfillmentRunAfter,
  isFulfillmentSendDue,
} from "../../../shared/fulfillment-sync";
import {
  assertKornitxCredentials,
  loadAppSettings,
} from "../app-settings";
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
    await writeEventLog({
      shop: job.shop,
      level: EVENT_LOG_LEVELS.INFO,
      category: EVENT_LOG_CATEGORIES.SHIPMENT,
      eventName: "fulfillment_send_deferred",
      message: `Fulfillment send deferred for ${order.kornitxId} until ${formatUkDateTime(nextRunAt)}.`,
      kornitxOrderId: order.kornitxId,
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderName: order.shopifyOrderName,
      syncJobId: job.id,
    });
    return { outcome: "deferred" as const, nextRunAt };
  }

  const unsent = await prisma.shippingStatusEvent.findMany({
    where: { kornitxOrderId: order.id, sent: false },
    orderBy: { id: "asc" },
  });

  if (unsent.length === 0) {
    console.log(
      `[run-jobs] Fulfillment job ${job.id} for order ${order.kornitxId}: no unsent shipping events — completing without calling KornitX`,
    );
    await completeSyncJob(job.id);
    await refreshOrderSendFulfillmentStatus(order.id);
    await writeEventLog({
      shop: job.shop,
      level: EVENT_LOG_LEVELS.INFO,
      category: EVENT_LOG_CATEGORIES.SHIPMENT,
      eventName: "fulfillment_send_nothing_to_send",
      message: `No unsent shipping statuses for ${order.kornitxId}.`,
      kornitxOrderId: order.kornitxId,
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderName: order.shopifyOrderName,
      syncJobId: job.id,
    });
    return { outcome: "nothing_to_send" as const };
  }

  const settings = await loadAppSettings(job.shop);

  try {
    assertKornitxCredentials(settings);
    await sendShippingStatusesToKornitx(settings, order, unsent);

    const now = new Date();
    await prisma.shippingStatusEvent.updateMany({
      where: { id: { in: unsent.map((event) => event.id) } },
      data: { sent: true, sentAt: now },
    });

    await completeSyncJob(job.id);

    await resolveOrderIssuesBySource(order.id, ISSUE_SOURCES.FULFILLMENT_SEND);

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
    } else {
      await refreshOrderSendFulfillmentStatus(order.id);
    }

    console.log(
      `[run-jobs] Sent ${unsent.length} shipping status(es) to KornitX for order ${order.kornitxId} in one API call`,
    );

    await writeEventLog({
      shop: job.shop,
      level: EVENT_LOG_LEVELS.SUCCESS,
      category: EVENT_LOG_CATEGORIES.SHIPMENT,
      eventName: "fulfillment_send_success",
      message: `Sent ${unsent.length} shipping status(es) to KornitX for order ${order.kornitxId}.`,
      kornitxOrderId: order.kornitxId,
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderName: order.shopifyOrderName,
      syncJobId: job.id,
    });

    return {
      outcome: "sent" as const,
      sentCount: unsent.length,
      remainingUnsent: remaining,
    };
  } catch (error) {
    const result = await failSyncJobWithBackoff(job, error);
    const message = error instanceof Error ? error.message : String(error);

    if (result.terminal) {
      await upsertOpenOrderIssue(
        order.id,
        ISSUE_TYPES.ERROR,
        ISSUE_SOURCES.FULFILLMENT_SEND,
        isConfigurationError(error)
          ? buildFulfillmentConfigFailureMessage(message)
          : `Fulfillment status could not be sent to KornitX: ${message}`,
      );
      await writeEventLog({
        shop: job.shop,
        level: EVENT_LOG_LEVELS.ERROR,
        category: EVENT_LOG_CATEGORIES.SHIPMENT,
        eventName: "fulfillment_send_failed_terminal",
        message: `Fulfillment send terminally failed for ${order.kornitxId} — ${message}`,
        kornitxOrderId: order.kornitxId,
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderName: order.shopifyOrderName,
        syncJobId: job.id,
      });
    } else {
      await upsertOpenOrderIssue(
        order.id,
        ISSUE_TYPES.WARNING,
        ISSUE_SOURCES.FULFILLMENT_SEND,
        buildFulfillmentSendRetryWarningMessage(
          message,
          result.attemptCount,
          result.nextRunAt,
        ),
      );
      await writeEventLog({
        shop: job.shop,
        level: EVENT_LOG_LEVELS.WARN,
        category: EVENT_LOG_CATEGORIES.SHIPMENT,
        eventName: "fulfillment_send_retry_scheduled",
        message: `Fulfillment send failed for ${order.kornitxId} (attempt ${result.attemptCount}) — ${message} Next retry at ${formatUkDateTime(result.nextRunAt)}.`,
        kornitxOrderId: order.kornitxId,
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderName: order.shopifyOrderName,
        syncJobId: job.id,
      });
    }

    await refreshOrderSendFulfillmentStatus(order.id);

    return {
      outcome: "error" as const,
      message,
    };
  }
}
