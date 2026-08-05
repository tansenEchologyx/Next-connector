import type { InventoryDelta, SyncJob } from "@prisma/client";

import { enqueueSendInventoryDeltaJobIfNeeded } from "../../../app/models/sync-jobs.server";
import {
  isInventorySyncDue,
  computeInventoryRunAfter,
} from "../../../shared/inventory-sync";
import { INVENTORY_SYNC_TYPES } from "../../../shared/inventory-sync-log";
import { isConfigurationError } from "../../../shared/configuration-error";
import {
  assertInventoryOutboundSettings,
  loadAppSettings,
} from "../app-settings";
import {
  MAX_EANS_PER_BATCH,
  sendStockAvailabilityBatchToKornitx,
} from "../kornitx-stock";
import {
  INVENTORY_SYNC_RUN_STATUSES,
  recordInventorySyncOutcome,
} from "../inventory-sync-observability";
import { prisma } from "../prisma";
import {
  completeSyncJob,
  failSyncJobWithBackoff,
  releaseSyncJobToPending,
} from "../sync-jobs";

type InventoryDeltaSnapshot = Pick<
  InventoryDelta,
  "id" | "ean" | "updatedAt" | "quantity"
>;

async function markInventoryDeltasSentOptimistically(
  shop: string,
  rows: InventoryDeltaSnapshot[],
): Promise<number> {
  let markedCount = 0;

  for (const row of rows) {
    const result = await prisma.inventoryDelta.updateMany({
      where: {
        id: row.id,
        shop,
        status: "unsent",
        updatedAt: row.updatedAt,
        quantity: row.quantity,
      },
      data: { status: "sent" },
    });
    markedCount += result.count;
  }

  return markedCount;
}

async function touchLastInventorySyncAt(shop: string, at: Date) {
  await prisma.appSettings.updateMany({
    where: { shop },
    data: { lastInventorySyncAt: at },
  });
}

async function recordDeltaFailure(
  job: SyncJob,
  error: unknown,
  startedAt: Date,
  eansAttempted = 0,
) {
  const result = await failSyncJobWithBackoff(job, error);
  const message = result.message;
  const isConfig = isConfigurationError(error);
  // attemptCount === 0 on the claimed job means this is the first failure of a
  // fresh send cycle — always insert a new log row (do not reuse an old one).
  const forceCreate = job.attemptCount === 0;

  if (result.terminal) {
    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.DELTA,
      status: INVENTORY_SYNC_RUN_STATUSES.FAILED,
      eansAttempted,
      errorMessage: message,
      nextRetryAt: null,
      syncJobId: job.id,
      startedAt,
      forceCreate,
      issue: { kind: "terminal", isConfigError: isConfig },
    });
  } else {
    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.DELTA,
      status: INVENTORY_SYNC_RUN_STATUSES.FAILED,
      eansAttempted,
      errorMessage: message,
      nextRetryAt: result.nextRunAt,
      syncJobId: job.id,
      startedAt,
      forceCreate,
      issue: {
        kind: "retry",
        attemptCount: result.attemptCount,
        nextRunAt: result.nextRunAt,
      },
    });
  }

  return {
    outcome: "error" as const,
    message,
    terminal: result.terminal,
  };
}

async function finalizeInventoryDeltaJob(
  job: SyncJob,
  settings: Awaited<ReturnType<typeof loadAppSettings>>,
  startedAt: Date,
  stats: {
    markedCount: number;
    rowsSentToKornitx: number;
    skippedDueToRace: number;
    partialBatchFailure?: boolean;
    batchError?: string;
  },
) {
  await completeSyncJob(job.id);

  const remaining = await prisma.inventoryDelta.count({
    where: { shop: job.shop, status: "unsent" },
  });

  if (remaining > 0) {
    await enqueueSendInventoryDeltaJobIfNeeded(job.shop);
  }

  if (stats.partialBatchFailure) {
    const nextRetryAt = computeInventoryRunAfter(settings);
    console.log(
      `[run-jobs] Inventory job ${job.id} for ${job.shop}: partial batch failure after sending ${stats.rowsSentToKornitx} row(s) to KornitX (marked ${stats.markedCount}). Remaining unsent: ${remaining}. Retry scheduled at inventory interval. Error: ${stats.batchError}`,
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.DELTA,
      status: INVENTORY_SYNC_RUN_STATUSES.PARTIAL,
      eansAttempted: stats.rowsSentToKornitx,
      eansMarkedSent: stats.markedCount,
      skippedRace: stats.skippedDueToRace,
      errorMessage: stats.batchError ?? "Partial batch failure",
      nextRetryAt,
      syncJobId: job.id,
      startedAt,
      metadata: { remainingUnsent: remaining },
      forceCreate: true,
      issue: {
        kind: "partial",
        nextRunAt: nextRetryAt,
      },
    });
  } else {
    if (stats.skippedDueToRace > 0) {
      console.log(
        `[run-jobs] Inventory job ${job.id} for ${job.shop}: marked ${stats.markedCount}/${stats.rowsSentToKornitx} sent; ${stats.skippedDueToRace} row(s) changed during run and remain unsent`,
      );
    }

    console.log(
      `[run-jobs] Sent ${stats.rowsSentToKornitx} inventory delta(s) to KornitX for ${job.shop}. Marked sent: ${stats.markedCount}. Remaining unsent: ${remaining}`,
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.DELTA,
      status: INVENTORY_SYNC_RUN_STATUSES.SUCCESS,
      eansAttempted: stats.rowsSentToKornitx,
      eansMarkedSent: stats.markedCount,
      skippedRace: stats.skippedDueToRace,
      errorMessage: null,
      nextRetryAt: null,
      syncJobId: job.id,
      startedAt,
      // Fresh cycle (attemptCount 0) → new row; mid-backoff success updates the open failed row.
      forceCreate: job.attemptCount === 0,
      metadata: { remainingUnsent: remaining },
      issue: { kind: "resolve" },
    });
  }

  return {
    outcome: "synced" as const,
    sentCount: stats.rowsSentToKornitx,
    markedCount: stats.markedCount,
    skippedDueToRace: stats.skippedDueToRace,
    remainingUnsent: remaining,
    partialBatchFailure: stats.partialBatchFailure ?? false,
  };
}

export async function handleSendInventoryDeltaJob(job: SyncJob) {
  const startedAt = new Date();
  const settings = await loadAppSettings(job.shop);

  if (!isInventorySyncDue(settings)) {
    const nextRunAt = computeInventoryRunAfter(settings);
    await releaseSyncJobToPending(
      job.id,
      nextRunAt,
      "Waiting for inventory sync interval",
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.DELTA,
      status: INVENTORY_SYNC_RUN_STATUSES.DEFERRED,
      nextRetryAt: nextRunAt,
      syncJobId: job.id,
      startedAt,
      errorMessage: "Waiting for inventory sync interval",
    });

    return { outcome: "deferred" as const, nextRunAt };
  }

  const unsent = await prisma.inventoryDelta.findMany({
    where: { shop: job.shop, status: "unsent" },
    orderBy: { updatedAt: "asc" },
  });

  if (unsent.length === 0) {
    console.log(
      `[run-jobs] Inventory job ${job.id} for ${job.shop}: no unsent deltas — completing without calling KornitX`,
    );
    await completeSyncJob(job.id);

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.DELTA,
      status: INVENTORY_SYNC_RUN_STATUSES.SKIPPED,
      syncJobId: job.id,
      startedAt,
      forceCreate: job.attemptCount === 0,
      metadata: { reason: "no_unsent_deltas" },
      issue: { kind: "resolve" },
    });

    return { outcome: "nothing_to_send" as const };
  }

  try {
    assertInventoryOutboundSettings(settings);
  } catch (error) {
    return recordDeltaFailure(job, error, startedAt, unsent.length);
  }

  const syncTime = new Date();
  let markedCount = 0;
  let rowsSentToKornitx = 0;
  let batchesSent = 0;

  try {
    for (let index = 0; index < unsent.length; index += MAX_EANS_PER_BATCH) {
      const batchRows = unsent.slice(index, index + MAX_EANS_PER_BATCH);
      const stockRows = batchRows.map((row) => ({
        ean: row.ean,
        quantity: row.quantity,
      }));

      try {
        await sendStockAvailabilityBatchToKornitx(settings, stockRows);
      } catch (batchError) {
        if (batchesSent > 0) {
          await touchLastInventorySyncAt(job.shop, syncTime);

          const message =
            batchError instanceof Error
              ? batchError.message
              : String(batchError);
          const skippedDueToRace = rowsSentToKornitx - markedCount;

          return finalizeInventoryDeltaJob(job, settings, startedAt, {
            markedCount,
            rowsSentToKornitx,
            skippedDueToRace,
            partialBatchFailure: true,
            batchError: message,
          });
        }

        throw batchError;
      }

      rowsSentToKornitx += batchRows.length;
      markedCount += await markInventoryDeltasSentOptimistically(
        job.shop,
        batchRows,
      );
      batchesSent += 1;
    }

    await touchLastInventorySyncAt(job.shop, syncTime);

    const skippedDueToRace = rowsSentToKornitx - markedCount;

    return finalizeInventoryDeltaJob(job, settings, startedAt, {
      markedCount,
      rowsSentToKornitx,
      skippedDueToRace,
    });
  } catch (error) {
    return recordDeltaFailure(job, error, startedAt, unsent.length);
  }
}
