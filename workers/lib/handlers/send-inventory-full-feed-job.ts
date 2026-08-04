import type { Prisma, SyncJob } from "@prisma/client";

import { getOfflineAccessToken } from "../../../app/services/shopify-offline.server";
import { isConfigurationError } from "../../../shared/configuration-error";
import { resolveEffectiveInventoryLocation } from "../../../shared/inventory-location";
import { INVENTORY_SYNC_TYPES } from "../../../shared/inventory-sync-log";
import type { SendInventoryFullFeedJobPayload } from "../../../shared/sync-job-types";
import {
  assertInventoryOutboundSettings,
  loadAppSettings,
} from "../app-settings";
import {
  MAX_EANS_PER_BATCH,
  sendStockAvailabilityBatchToKornitx,
  type StockAvailabilityRow,
} from "../kornitx-stock";
import {
  INVENTORY_SYNC_RUN_STATUSES,
  recordInventorySyncOutcome,
} from "../inventory-sync-observability";
import { prisma } from "../prisma";
import {
  fetchPrimaryLocationOffline,
  fetchVariantAvailableQuantities,
} from "../shopify-inventory";
import { completeSyncJob, failSyncJobWithBackoff } from "../sync-jobs";

function parseFullFeedPayload(
  payload: Prisma.JsonValue,
): SendInventoryFullFeedJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const remainingEans = (payload as SendInventoryFullFeedJobPayload)
    .remainingEans;
  if (!Array.isArray(remainingEans)) return {};
  return {
    remainingEans: remainingEans.filter(
      (ean): ean is string => typeof ean === "string" && ean.length > 0,
    ),
  };
}

async function resolveLocationIdForShop(
  shop: string,
  accessToken: string,
): Promise<string> {
  const settings = await loadAppSettings(shop);
  if (!settings) {
    throw new Error("App settings missing for inventory full feed");
  }

  const effective = resolveEffectiveInventoryLocation(settings);
  if (effective.mode === "selected") {
    if (!effective.locationId) {
      throw new Error(
        "Inventory location not configured for daily full feed",
      );
    }
    return effective.locationId;
  }

  const primary = await fetchPrimaryLocationOffline(shop, accessToken);
  if (!primary) {
    throw new Error("No Shopify primary location found for daily full feed");
  }
  return primary.id;
}

async function markDailyFullFeedComplete(shop: string, at: Date) {
  await prisma.appSettings.updateMany({
    where: { shop },
    data: { lastDailyFullFeedAt: at },
  });
}

async function recordFullFeedFailure(
  job: SyncJob,
  error: unknown,
  startedAt: Date,
  stats?: {
    eansAttempted?: number;
    eansMarkedSent?: number;
    remainingCount?: number;
    partialBatchFailure?: boolean;
  },
) {
  const result = await failSyncJobWithBackoff(job, error);
  const message = result.message;
  const isConfig = isConfigurationError(error);

  if (result.terminal) {
    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.FULL_FEED,
      status: INVENTORY_SYNC_RUN_STATUSES.FAILED,
      eansAttempted: stats?.eansAttempted ?? 0,
      eansMarkedSent: stats?.eansMarkedSent ?? 0,
      errorMessage: message,
      nextRetryAt: null,
      syncJobId: job.id,
      startedAt,
      metadata: stats?.remainingCount
        ? { remainingCount: stats.remainingCount }
        : undefined,
      issue: { kind: "terminal", isConfigError: isConfig },
    });
  } else {
    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.FULL_FEED,
      status: stats?.partialBatchFailure
        ? INVENTORY_SYNC_RUN_STATUSES.PARTIAL
        : INVENTORY_SYNC_RUN_STATUSES.FAILED,
      eansAttempted: stats?.eansAttempted ?? 0,
      eansMarkedSent: stats?.eansMarkedSent ?? 0,
      errorMessage: message,
      nextRetryAt: result.nextRunAt,
      syncJobId: job.id,
      startedAt,
      metadata: stats?.remainingCount
        ? { remainingCount: stats.remainingCount }
        : undefined,
      issue: stats?.partialBatchFailure
        ? {
            kind: "partial",
            nextRunAt: result.nextRunAt,
          }
        : {
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
    partialBatchFailure: stats?.partialBatchFailure ?? false,
    sentCount: stats?.eansMarkedSent ?? 0,
    remainingCount: stats?.remainingCount,
  };
}

export async function handleSendInventoryFullFeedJob(job: SyncJob) {
  const startedAt = new Date();
  const settings = await loadAppSettings(job.shop);

  if (!settings?.dailyFullFeedEnabled) {
    await completeSyncJob(job.id);
    console.log(
      `[run-jobs] Full feed job ${job.id} for ${job.shop}: daily full feed disabled — completing`,
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.FULL_FEED,
      status: INVENTORY_SYNC_RUN_STATUSES.SKIPPED,
      syncJobId: job.id,
      startedAt,
      metadata: { reason: "daily_full_feed_disabled" },
    });

    return { outcome: "nothing_to_send" as const };
  }

  const tracked = await prisma.trackedProduct.findMany({
    where: { shop: job.shop, enabled: true },
    orderBy: { id: "asc" },
  });

  const completedAt = new Date();

  if (tracked.length === 0) {
    await markDailyFullFeedComplete(job.shop, completedAt);
    await completeSyncJob(job.id);
    console.log(
      `[run-jobs] Full feed job ${job.id} for ${job.shop}: no tracked products — marked complete for today`,
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.FULL_FEED,
      status: INVENTORY_SYNC_RUN_STATUSES.SKIPPED,
      syncJobId: job.id,
      startedAt,
      metadata: { reason: "no_tracked_products" },
      issue: { kind: "resolve" },
    });

    return { outcome: "nothing_to_send" as const, sentCount: 0 };
  }

  const payload = parseFullFeedPayload(job.payload);
  const remainingFilter = payload.remainingEans?.length
    ? new Set(payload.remainingEans)
    : null;

  const trackedForRun = remainingFilter
    ? tracked.filter((row) => remainingFilter.has(row.ean))
    : tracked;

  if (trackedForRun.length === 0) {
    await markDailyFullFeedComplete(job.shop, completedAt);
    await completeSyncJob(job.id);
    console.log(
      `[run-jobs] Full feed job ${job.id} for ${job.shop}: no remaining EANs — marked complete`,
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.FULL_FEED,
      status: INVENTORY_SYNC_RUN_STATUSES.SKIPPED,
      syncJobId: job.id,
      startedAt,
      metadata: { reason: "no_remaining_eans" },
      issue: { kind: "resolve" },
    });

    return { outcome: "nothing_to_send" as const, sentCount: 0 };
  }

  try {
    assertInventoryOutboundSettings(settings);
  } catch (error) {
    return recordFullFeedFailure(job, error, startedAt, {
      eansAttempted: trackedForRun.length,
    });
  }

  try {
    const accessToken = await getOfflineAccessToken(job.shop);
    const locationId = await resolveLocationIdForShop(job.shop, accessToken);
    const quantities = await fetchVariantAvailableQuantities(
      job.shop,
      accessToken,
      trackedForRun.map((row) => row.variantId),
      locationId,
    );

    // One row per tracked EAN — qty 0 when out of stock / missing level (never omit).
    const stockRows: StockAvailabilityRow[] = trackedForRun.map((row) => ({
      ean: row.ean,
      quantity: quantities.get(row.variantId) ?? 0,
    }));

    let rowsSent = 0;
    let batchesSent = 0;

    for (let index = 0; index < stockRows.length; index += MAX_EANS_PER_BATCH) {
      const batch = stockRows.slice(index, index + MAX_EANS_PER_BATCH);

      try {
        await sendStockAvailabilityBatchToKornitx(settings, batch);
      } catch (batchError) {
        if (batchesSent > 0) {
          const remainingEans = stockRows.slice(index).map((row) => row.ean);

          await prisma.syncJob.update({
            where: { id: job.id },
            data: {
              payload: { remainingEans } as Prisma.InputJsonValue,
            },
          });

          console.log(
            `[run-jobs] Full feed job ${job.id} for ${job.shop}: partial batch failure after ${rowsSent} EAN(s). Remaining: ${remainingEans.length}. Retry with backoff.`,
          );

          return recordFullFeedFailure(job, batchError, startedAt, {
            eansAttempted: stockRows.length,
            eansMarkedSent: rowsSent,
            remainingCount: remainingEans.length,
            partialBatchFailure: true,
          });
        }

        throw batchError;
      }

      rowsSent += batch.length;
      batchesSent += 1;
    }

    await markDailyFullFeedComplete(job.shop, completedAt);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { payload: {} },
    });
    await completeSyncJob(job.id);

    console.log(
      `[run-jobs] Full feed job ${job.id} for ${job.shop}: sent ${rowsSent} tracked EAN(s) to KornitX`,
    );

    await recordInventorySyncOutcome({
      shop: job.shop,
      syncType: INVENTORY_SYNC_TYPES.FULL_FEED,
      status: INVENTORY_SYNC_RUN_STATUSES.SUCCESS,
      eansAttempted: rowsSent,
      eansMarkedSent: rowsSent,
      errorMessage: null,
      nextRetryAt: null,
      syncJobId: job.id,
      startedAt,
      issue: { kind: "resolve" },
    });

    return {
      outcome: "synced" as const,
      sentCount: rowsSent,
    };
  } catch (error) {
    return recordFullFeedFailure(job, error, startedAt, {
      eansAttempted: trackedForRun.length,
    });
  }
}
