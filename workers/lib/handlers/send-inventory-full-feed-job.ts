import type { Prisma, SyncJob } from "@prisma/client";

import { getOfflineAccessToken } from "../../../app/services/shopify-offline.server";
import { resolveEffectiveInventoryLocation } from "../../../shared/inventory-location";
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

export async function handleSendInventoryFullFeedJob(job: SyncJob) {
  const settings = await loadAppSettings(job.shop);

  if (!settings?.dailyFullFeedEnabled) {
    await completeSyncJob(job.id);
    console.log(
      `[run-jobs] Full feed job ${job.id} for ${job.shop}: daily full feed disabled — completing`,
    );
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
    return { outcome: "nothing_to_send" as const, sentCount: 0 };
  }

  try {
    assertInventoryOutboundSettings(settings);
  } catch (error) {
    await failSyncJobWithBackoff(job, error);
    return {
      outcome: "error" as const,
      message: error instanceof Error ? error.message : String(error),
    };
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
          const remainingEans = stockRows
            .slice(index)
            .map((row) => row.ean);

          await prisma.syncJob.update({
            where: { id: job.id },
            data: {
              payload: { remainingEans } as Prisma.InputJsonValue,
            },
          });

          await failSyncJobWithBackoff(job, batchError);
          console.log(
            `[run-jobs] Full feed job ${job.id} for ${job.shop}: partial batch failure after ${rowsSent} EAN(s). Remaining: ${remainingEans.length}. Retry with backoff.`,
          );
          return {
            outcome: "error" as const,
            message:
              batchError instanceof Error
                ? batchError.message
                : String(batchError),
            partialBatchFailure: true,
            sentCount: rowsSent,
            remainingCount: remainingEans.length,
          };
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

    return {
      outcome: "synced" as const,
      sentCount: rowsSent,
    };
  } catch (error) {
    await failSyncJobWithBackoff(job, error);
    return {
      outcome: "error" as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
