import type { Prisma } from "@prisma/client";

import prisma from "../db.server";
import {
  INVENTORY_SYNC_ISSUE_TYPES,
  type InventorySyncType,
} from "../../shared/inventory-sync-log";

export { INVENTORY_SYNC_ISSUE_TYPES };

export async function createInventorySyncIssue(
  shop: string,
  syncType: InventorySyncType,
  type: string,
  message: string,
) {
  await resolveInventorySyncIssuesByType(shop, syncType);

  return prisma.inventorySyncIssue.create({
    data: {
      shop,
      syncType,
      type,
      message,
    },
  });
}

export async function upsertOpenInventorySyncIssue(
  shop: string,
  syncType: InventorySyncType,
  type: string,
  message: string,
) {
  const existing = await prisma.inventorySyncIssue.findFirst({
    where: { shop, syncType, resolvedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    if (existing.message === message && existing.type === type) {
      return existing;
    }

    return prisma.inventorySyncIssue.update({
      where: { id: existing.id },
      data: { type, message },
    });
  }

  return prisma.inventorySyncIssue.create({
    data: { shop, syncType, type, message },
  });
}

export async function resolveInventorySyncIssuesByType(
  shop: string,
  syncType: InventorySyncType,
) {
  const now = new Date();
  await prisma.inventorySyncIssue.updateMany({
    where: { shop, syncType, resolvedAt: null },
    data: { resolvedAt: now },
  });
}

export async function resolveAllInventorySyncIssues(shop: string) {
  const now = new Date();
  await prisma.inventorySyncIssue.updateMany({
    where: { shop, resolvedAt: null },
    data: { resolvedAt: now },
  });
}

export async function countOpenInventorySyncIssues(shop: string) {
  return prisma.inventorySyncIssue.count({
    where: { shop, resolvedAt: null },
  });
}

export async function listOpenInventorySyncIssues(shop: string) {
  return prisma.inventorySyncIssue.findMany({
    where: { shop, resolvedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export type CreateInventorySyncRunInput = {
  shop: string;
  syncType: InventorySyncType;
  status: string;
  eansAttempted?: number;
  eansMarkedSent?: number;
  skippedRace?: number;
  errorMessage?: string | null;
  nextRetryAt?: Date | null;
  syncJobId?: number | null;
  startedAt?: Date;
  finishedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
};

/**
 * Open retry/defer lifecycle for a SyncJob: failed-with-next-retry, deferred,
 * legacy retrying, or full-feed partial-with-next-retry.
 * Delta partial is force-created history and is not open (next interval = new row).
 */
export async function findOpenLifecycleInventorySyncRun(syncJobId: number) {
  return prisma.inventorySyncRun.findFirst({
    where: {
      syncJobId,
      OR: [
        {
          status: "failed",
          nextRetryAt: { not: null },
        },
        { status: "deferred" },
        { status: "retrying" },
        {
          status: "partial",
          nextRetryAt: { not: null },
          syncType: "full_feed",
        },
      ],
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function createInventorySyncRun(input: CreateInventorySyncRunInput) {
  const finishedAt = input.finishedAt === undefined ? new Date() : input.finishedAt;

  return prisma.inventorySyncRun.create({
    data: {
      shop: input.shop,
      syncType: input.syncType,
      status: input.status,
      eansAttempted: input.eansAttempted ?? 0,
      eansMarkedSent: input.eansMarkedSent ?? 0,
      skippedRace: input.skippedRace ?? 0,
      errorMessage: input.errorMessage ?? null,
      nextRetryAt: input.nextRetryAt ?? null,
      syncJobId: input.syncJobId ?? null,
      startedAt: input.startedAt ?? new Date(),
      finishedAt,
      metadata: input.metadata ?? undefined,
    },
  });
}

/**
 * Update the open lifecycle row for this SyncJob, or create a new run.
 * Pass `forceCreate: true` for closed historical attempts (e.g. delta partial).
 */
export async function upsertInventorySyncRun(
  input: CreateInventorySyncRunInput & { forceCreate?: boolean },
) {
  const finishedAt = input.finishedAt === undefined ? new Date() : input.finishedAt;
  const data = {
    shop: input.shop,
    syncType: input.syncType,
    status: input.status,
    eansAttempted: input.eansAttempted ?? 0,
    eansMarkedSent: input.eansMarkedSent ?? 0,
    skippedRace: input.skippedRace ?? 0,
    errorMessage: input.errorMessage ?? null,
    nextRetryAt: input.nextRetryAt ?? null,
    syncJobId: input.syncJobId ?? null,
    finishedAt,
    metadata: input.metadata ?? undefined,
  };

  if (!input.forceCreate && input.syncJobId != null) {
    const existing = await findOpenLifecycleInventorySyncRun(input.syncJobId);
    if (existing) {
      return prisma.inventorySyncRun.update({
        where: { id: existing.id },
        data: {
          ...data,
          // Keep original startedAt for the retry chain.
          startedAt: existing.startedAt,
        },
      });
    }
  }

  return prisma.inventorySyncRun.create({
    data: {
      ...data,
      startedAt: input.startedAt ?? new Date(),
    },
  });
}
