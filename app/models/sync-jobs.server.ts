import type { Prisma } from "@prisma/client";

import prisma from "../db.server";
import { computeFulfillmentRunAfter } from "../../shared/fulfillment-sync";
import { computeInventoryRunAfter } from "../../shared/inventory-sync";
import {
  formatUkCalendarDate,
  isDailyFullFeedDue,
} from "../../shared/uk-time";
import {
  SYNC_JOB_STATUSES,
  SYNC_JOB_TYPES,
  type ProcessOrderJobPayload,
  type SendFulfillmentJobPayload,
  type SendInventoryDeltaJobPayload,
  type SendInventoryFullFeedJobPayload,
} from "../../shared/sync-job-types";
import { getDefaultMaxAttempts } from "../../shared/retry";

function processOrderKey(kornitxId: string): string {
  return `${SYNC_JOB_TYPES.PROCESS_ORDER}:${kornitxId}`;
}

function sendFulfillmentKey(kornitxId: string): string {
  return `${SYNC_JOB_TYPES.SEND_FULFILLMENT}:order:${kornitxId}`;
}

function sendInventoryDeltaKey(shop: string): string {
  return `${SYNC_JOB_TYPES.SEND_INVENTORY_DELTA}:${shop}`;
}

function sendInventoryFullFeedKey(shop: string, ukDate: string): string {
  return `${SYNC_JOB_TYPES.SEND_INVENTORY_FULL_FEED}:${shop}:${ukDate}`;
}

export async function enqueueProcessOrderJob(
  shop: string,
  kornitxOrderId: number,
  kornitxId: string,
) {
  const payload: ProcessOrderJobPayload = { kornitxOrderId };
  const now = new Date();

  return prisma.syncJob.upsert({
    where: { idempotencyKey: processOrderKey(kornitxId) },
    create: {
      shop,
      jobType: SYNC_JOB_TYPES.PROCESS_ORDER,
      idempotencyKey: processOrderKey(kornitxId),
      payload: payload as Prisma.InputJsonValue,
      status: SYNC_JOB_STATUSES.PENDING,
      runAfter: now,
      nextRunAt: now,
      maxAttempts: getDefaultMaxAttempts(),
    },
    update: {
      shop,
      payload: payload as Prisma.InputJsonValue,
      status: SYNC_JOB_STATUSES.PENDING,
      runAfter: now,
      nextRunAt: now,
      attemptCount: 0,
      lastError: null,
      lockedAt: null,
      completedAt: null,
    },
  });
}

export async function enqueueSendFulfillmentJobIfNeeded(
  shop: string,
  kornitxOrderId: number,
  kornitxId: string,
  orderReceivedAt: Date,
  options?: { forceReset?: boolean },
) {
  const key = sendFulfillmentKey(kornitxId);
  const existing = await prisma.syncJob.findUnique({
    where: { idempotencyKey: key },
  });

  if (
    !options?.forceReset &&
    existing &&
    (existing.status === SYNC_JOB_STATUSES.PENDING ||
      existing.status === SYNC_JOB_STATUSES.PROCESSING)
  ) {
    return existing;
  }

  const runAfter = computeFulfillmentRunAfter(orderReceivedAt);
  const now = new Date();
  const nextRunAt = runAfter > now ? runAfter : now;
  const payload: SendFulfillmentJobPayload = { kornitxOrderId };

  if (!existing) {
    return prisma.syncJob.create({
      data: {
        shop,
        jobType: SYNC_JOB_TYPES.SEND_FULFILLMENT,
        idempotencyKey: key,
        payload: payload as Prisma.InputJsonValue,
        status: SYNC_JOB_STATUSES.PENDING,
        runAfter,
        nextRunAt,
        maxAttempts: getDefaultMaxAttempts(),
      },
    });
  }

  return prisma.syncJob.update({
    where: { id: existing.id },
    data: {
      shop,
      payload: payload as Prisma.InputJsonValue,
      status: SYNC_JOB_STATUSES.PENDING,
      runAfter,
      nextRunAt,
      attemptCount: 0,
      lastError: null,
      lockedAt: null,
      completedAt: null,
    },
  });
}

export async function enqueueSendInventoryDeltaJobIfNeeded(shop: string) {
  const key = sendInventoryDeltaKey(shop);
  const existing = await prisma.syncJob.findUnique({
    where: { idempotencyKey: key },
  });

  if (
    existing &&
    (existing.status === SYNC_JOB_STATUSES.PENDING ||
      existing.status === SYNC_JOB_STATUSES.PROCESSING)
  ) {
    return existing;
  }

  const settings = await prisma.appSettings.findUnique({ where: { shop } });
  const runAfter = computeInventoryRunAfter(settings);
  const now = new Date();
  const nextRunAt = runAfter > now ? runAfter : now;
  const payload: SendInventoryDeltaJobPayload = {};

  if (!existing) {
    return prisma.syncJob.create({
      data: {
        shop,
        jobType: SYNC_JOB_TYPES.SEND_INVENTORY_DELTA,
        idempotencyKey: key,
        payload: payload as Prisma.InputJsonValue,
        status: SYNC_JOB_STATUSES.PENDING,
        runAfter,
        nextRunAt,
        maxAttempts: getDefaultMaxAttempts(),
      },
    });
  }

  return prisma.syncJob.update({
    where: { id: existing.id },
    data: {
      status: SYNC_JOB_STATUSES.PENDING,
      runAfter,
      nextRunAt,
      attemptCount: 0,
      lastError: null,
      lockedAt: null,
      completedAt: null,
    },
  });
}

export async function enqueueSendInventoryFullFeedJob(
  shop: string,
  ukDate: string,
) {
  const key = sendInventoryFullFeedKey(shop, ukDate);
  const existing = await prisma.syncJob.findUnique({
    where: { idempotencyKey: key },
  });

  if (
    existing &&
    (existing.status === SYNC_JOB_STATUSES.PENDING ||
      existing.status === SYNC_JOB_STATUSES.PROCESSING)
  ) {
    return existing;
  }

  const now = new Date();
  const existingPayload =
    existing?.payload &&
    typeof existing.payload === "object" &&
    !Array.isArray(existing.payload)
      ? (existing.payload as SendInventoryFullFeedJobPayload)
      : {};
  const payload: SendInventoryFullFeedJobPayload =
    Array.isArray(existingPayload.remainingEans) &&
    existingPayload.remainingEans.length > 0
      ? { remainingEans: existingPayload.remainingEans }
      : {};

  if (!existing) {
    return prisma.syncJob.create({
      data: {
        shop,
        jobType: SYNC_JOB_TYPES.SEND_INVENTORY_FULL_FEED,
        idempotencyKey: key,
        payload: payload as Prisma.InputJsonValue,
        status: SYNC_JOB_STATUSES.PENDING,
        runAfter: now,
        nextRunAt: now,
        maxAttempts: getDefaultMaxAttempts(),
      },
    });
  }

  return prisma.syncJob.update({
    where: { id: existing.id },
    data: {
      status: SYNC_JOB_STATUSES.PENDING,
      payload: payload as Prisma.InputJsonValue,
      runAfter: now,
      nextRunAt: now,
      attemptCount: 0,
      lastError: null,
      lockedAt: null,
      completedAt: null,
    },
  });
}

/** Enqueue one full-feed SyncJob per shop that is due for today's UK schedule. */
export async function enqueueDailyFullFeedJobsIfDue(now = new Date()) {
  const settingsRows = await prisma.appSettings.findMany({
    where: { dailyFullFeedEnabled: true },
  });

  let enqueued = 0;
  const ukDate = formatUkCalendarDate(now);

  for (const settings of settingsRows) {
    if (!isDailyFullFeedDue(settings, now)) continue;
    await enqueueSendInventoryFullFeedJob(settings.shop, ukDate);
    enqueued += 1;
  }

  return enqueued;
}
