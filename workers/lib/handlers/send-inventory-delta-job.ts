import type { SyncJob } from "@prisma/client";

import { enqueueSendInventoryDeltaJobIfNeeded } from "../../../app/models/sync-jobs.server";
import { isInventorySyncDue, computeInventoryRunAfter } from "../../../shared/inventory-sync";
import { loadAppSettings } from "../app-settings";
import { sendStockAvailabilityToKornitx } from "../kornitx-stock";
import { prisma } from "../prisma";
import {
  completeSyncJob,
  failSyncJobWithBackoff,
  releaseSyncJobToPending,
} from "../sync-jobs";

export async function handleSendInventoryDeltaJob(job: SyncJob) {
  const settings = await loadAppSettings(job.shop);

  if (!isInventorySyncDue(settings)) {
    const nextRunAt = computeInventoryRunAfter(settings);
    await releaseSyncJobToPending(
      job.id,
      nextRunAt,
      "Waiting for inventory sync interval",
    );
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
    return { outcome: "nothing_to_send" as const };
  }

  try {
    await sendStockAvailabilityToKornitx(
      settings,
      unsent.map((row) => ({ ean: row.ean, quantity: row.quantity })),
    );

    const now = new Date();
    let markedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of unsent) {
        const result = await tx.inventoryDelta.updateMany({
          where: {
            id: row.id,
            shop: job.shop,
            status: "unsent",
            updatedAt: row.updatedAt,
            quantity: row.quantity,
          },
          data: { status: "sent" },
        });
        markedCount += result.count;
      }

      await tx.appSettings.updateMany({
        where: { shop: job.shop },
        data: { lastInventorySyncAt: now },
      });
    });

    const skippedDueToRace = unsent.length - markedCount;

    await completeSyncJob(job.id);

    const remaining = await prisma.inventoryDelta.count({
      where: { shop: job.shop, status: "unsent" },
    });

    if (remaining > 0) {
      await enqueueSendInventoryDeltaJobIfNeeded(job.shop);
    }

    if (skippedDueToRace > 0) {
      console.log(
        `[run-jobs] Inventory job ${job.id} for ${job.shop}: marked ${markedCount}/${unsent.length} sent; ${skippedDueToRace} row(s) changed during run and remain unsent`,
      );
    }

    console.log(
      `[run-jobs] Sent ${unsent.length} inventory delta(s) to KornitX for ${job.shop}. Marked sent: ${markedCount}. Remaining unsent: ${remaining}`,
    );

    return {
      outcome: "synced" as const,
      sentCount: unsent.length,
      markedCount,
      skippedDueToRace,
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
