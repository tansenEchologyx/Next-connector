import type { SyncJob } from "@prisma/client";

import {
  ISSUE_SOURCES,
  ISSUE_TYPES,
  upsertOpenOrderIssue,
} from "../../../app/models/kornitx-order-issues.server";
import { writeEventLog } from "../../../app/models/event-log.server";
import { isConfigurationError } from "../../../shared/configuration-error";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../../../shared/event-log";
import {
  buildOrderCreationConfigFailureMessage,
  buildOrderCreationRetryWarningMessage,
} from "../../../shared/order-processing-issues";
import type { ProcessOrderJobPayload } from "../../../shared/sync-job-types";
import { formatUkDateTime } from "../../../shared/uk-time";
import { processKornitxOrder } from "../process-kornitx-order";
import { prisma } from "../prisma";
import {
  markOrderFailed,
  markOrderProcessing,
  markOrderReceivedForRetry,
} from "../orders";
import {
  completeSyncJob,
  failSyncJobWithBackoff,
} from "../sync-jobs";

export async function handleProcessOrderJob(job: SyncJob) {
  const payload = job.payload as ProcessOrderJobPayload;
  const order = await prisma.kornitxOrder.findUnique({
    where: { id: payload.kornitxOrderId },
    include: { items: true },
  });

  if (!order) {
    throw new Error(`KornitX order ${payload.kornitxOrderId} not found`);
  }

  if (order.status === "created") {
    await completeSyncJob(job.id);
    await writeEventLog({
      shop: job.shop,
      level: EVENT_LOG_LEVELS.INFO,
      category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
      eventName: "shopify_order_already_created",
      message: `KornitX order ${order.kornitxId} already has a Shopify order.`,
      kornitxOrderId: order.kornitxId,
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderName: order.shopifyOrderName,
      syncJobId: job.id,
    });
    return { outcome: "already_created" as const };
  }

  await markOrderProcessing(order.id);
  await writeEventLog({
    shop: job.shop,
    level: EVENT_LOG_LEVELS.INFO,
    category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
    eventName: "shopify_order_processing_started",
    message: `Processing KornitX order ${order.kornitxId} for Shopify creation.`,
    kornitxOrderId: order.kornitxId,
    syncJobId: job.id,
  });

  try {
    await processKornitxOrder(order);
    await completeSyncJob(job.id);
    return { outcome: "created" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = await failSyncJobWithBackoff(job, error, async () => {
      const failureMessage = isConfigurationError(error)
        ? buildOrderCreationConfigFailureMessage(message)
        : message;
      await markOrderFailed(order.id, failureMessage);
    });

    if (!result.terminal) {
      await markOrderReceivedForRetry(order.id, message);

      // ERROR (not WARNING): Shopify order was not created — red issue icon + Retry
      // button while auto-retry backoff continues.
      await upsertOpenOrderIssue(
        order.id,
        ISSUE_TYPES.ERROR,
        ISSUE_SOURCES.ORDER_PROCESSING,
        buildOrderCreationRetryWarningMessage(
          message,
          result.attemptCount,
          result.nextRunAt,
        ),
      );

      await writeEventLog({
        shop: job.shop,
        level: EVENT_LOG_LEVELS.WARN,
        category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
        eventName: "shopify_order_creation_retry_scheduled",
        message: `Shopify order creation failed for ${order.kornitxId} (attempt ${result.attemptCount}) — ${message} Next retry at ${formatUkDateTime(result.nextRunAt)}.`,
        kornitxOrderId: order.kornitxId,
        syncJobId: job.id,
      });
    } else {
      await writeEventLog({
        shop: job.shop,
        level: EVENT_LOG_LEVELS.ERROR,
        category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
        eventName: "shopify_order_creation_failed_terminal",
        message: `Shopify order creation terminally failed for ${order.kornitxId} — ${message}`,
        kornitxOrderId: order.kornitxId,
        syncJobId: job.id,
      });
    }

    return {
      outcome: result.terminal ? ("failed" as const) : ("retry_scheduled" as const),
      message: result.message,
    };
  }
}
