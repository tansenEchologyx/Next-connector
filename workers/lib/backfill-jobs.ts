import { SYNC_JOB_STATUSES, SYNC_JOB_TYPES } from "../../shared/sync-job-types";
import { enqueueProcessOrderJob } from "../../app/models/sync-jobs.server";
import { resolveDefaultShop } from "../../app/models/shop.server";
import { prisma } from "./prisma";

const STALE_PROCESSING_MS = 15 * 60 * 1000;

export async function backfillProcessOrderJobs() {
  const shop = await resolveDefaultShop();
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);

  await prisma.kornitxOrder.updateMany({
    where: {
      status: "processing",
      updatedAt: { lt: staleBefore },
    },
    data: { status: "received" },
  });

  const orders = await prisma.kornitxOrder.findMany({
    where: { status: { in: ["received", "failed"] } },
    select: { id: true, kornitxId: true, status: true },
  });

  let enqueued = 0;

  for (const order of orders) {
    if (order.status === "failed") continue;

    const existingJob = await prisma.syncJob.findUnique({
      where: {
        idempotencyKey: `${SYNC_JOB_TYPES.PROCESS_ORDER}:${order.kornitxId}`,
      },
    });

    if (
      existingJob &&
      (existingJob.status === SYNC_JOB_STATUSES.PENDING ||
        existingJob.status === SYNC_JOB_STATUSES.PROCESSING)
    ) {
      continue;
    }

    await enqueueProcessOrderJob(shop, order.id, order.kornitxId);
    enqueued += 1;
  }

  return enqueued;
}
