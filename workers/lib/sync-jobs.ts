import type { SyncJob } from "@prisma/client";

import { prisma } from "./prisma";
import {
  SYNC_JOB_STATUSES,
  SYNC_JOB_TYPE_PRIORITY,
  type SyncJobType,
} from "../../shared/sync-job-types";
import { computeNextRetryAt, isRetryableError } from "../../shared/retry";

const STALE_PROCESSING_MS = 15 * 60 * 1000;

export async function reclaimStaleSyncJobs() {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const result = await prisma.syncJob.updateMany({
    where: {
      status: SYNC_JOB_STATUSES.PROCESSING,
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: SYNC_JOB_STATUSES.PENDING,
      lockedAt: null,
    },
  });
  return result.count;
}

export async function claimDueSyncJobs(
  jobType: SyncJobType,
  limit: number,
): Promise<SyncJob[]> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const jobs = await tx.syncJob.findMany({
      where: {
        jobType,
        status: SYNC_JOB_STATUSES.PENDING,
        nextRunAt: { lte: now },
        runAfter: { lte: now },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    if (jobs.length === 0) return [];

    await tx.syncJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: {
        status: SYNC_JOB_STATUSES.PROCESSING,
        lockedAt: now,
      },
    });

    return jobs.map((job) => ({
      ...job,
      status: SYNC_JOB_STATUSES.PROCESSING,
      lockedAt: now,
    }));
  });
}

/** Claims a single due job using type priority (process_order → fulfillment → inventory). */
export async function claimNextDueSyncJob(): Promise<SyncJob | null> {
  for (const jobType of SYNC_JOB_TYPE_PRIORITY) {
    const jobs = await claimDueSyncJobs(jobType, 1);
    if (jobs.length > 0) {
      return jobs[0] ?? null;
    }
  }
  return null;
}

export async function releaseSyncJobToPending(
  jobId: number,
  nextRunAt: Date,
  lastError?: string,
) {
  return prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: SYNC_JOB_STATUSES.PENDING,
      nextRunAt,
      runAfter: nextRunAt,
      lockedAt: null,
      lastError: lastError ?? null,
    },
  });
}

export async function completeSyncJob(jobId: number) {
  return prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: SYNC_JOB_STATUSES.COMPLETED,
      completedAt: new Date(),
      lockedAt: null,
      lastError: null,
    },
  });
}

export async function failSyncJobWithBackoff(
  job: SyncJob,
  error: unknown,
  onTerminal?: () => Promise<void>,
) {
  const message = error instanceof Error ? error.message : String(error);
  const nextAttempt = job.attemptCount + 1;
  const terminal = !isRetryableError(error) || nextAttempt >= job.maxAttempts;

  if (terminal) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: SYNC_JOB_STATUSES.FAILED,
        attemptCount: nextAttempt,
        lastError: message,
        lockedAt: null,
      },
    });
    if (onTerminal) await onTerminal();
    return { terminal: true as const, message };
  }

  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: SYNC_JOB_STATUSES.PENDING,
      attemptCount: nextAttempt,
      nextRunAt: computeNextRetryAt(nextAttempt),
      lastError: message,
      lockedAt: null,
    },
  });

  return { terminal: false as const, message };
}
