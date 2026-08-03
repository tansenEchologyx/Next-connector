import type { SyncJob } from "@prisma/client";

import {
  ISSUE_SOURCES,
  ISSUE_TYPES,
  upsertOpenOrderIssue,
} from "../../../app/models/kornitx-order-issues.server";
import { isConfigurationError } from "../../../shared/configuration-error";
import {
  buildOrderCreationConfigFailureMessage,
  buildOrderCreationRetryWarningMessage,
} from "../../../shared/order-processing-issues";
import type { ProcessOrderJobPayload } from "../../../shared/sync-job-types";
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
    return { outcome: "already_created" as const };
  }

  await markOrderProcessing(order.id);

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

      await upsertOpenOrderIssue(
        order.id,
        ISSUE_TYPES.WARNING,
        ISSUE_SOURCES.ORDER_PROCESSING,
        buildOrderCreationRetryWarningMessage(
          message,
          result.attemptCount,
          result.nextRunAt,
        ),
      );
    }

    return {
      outcome: result.terminal ? ("failed" as const) : ("retry_scheduled" as const),
      message: result.message,
    };
  }
}
