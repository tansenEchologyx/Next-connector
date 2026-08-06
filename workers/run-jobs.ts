import { loadEnv } from "./lib/load-env";
import { disconnectPrisma } from "./lib/prisma";
import { backfillProcessOrderJobs } from "./lib/backfill-jobs";
import { dispatchSyncJob } from "./lib/dispatch-sync-job";
import {
  claimNextDueSyncJob,
  reclaimStaleSyncJobs,
} from "./lib/sync-jobs";
import { enqueueDailyFullFeedJobsIfDue } from "../app/models/sync-jobs.server";
import { writeEventLog } from "../app/models/event-log.server";
import { resolveDefaultShop } from "../app/models/shop.server";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../shared/event-log";

loadEnv();

const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;
// const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

function pollIntervalMs(): number {
  const raw = process.env.WORKER_POLL_INTERVAL_MS?.trim();
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CycleStats = {
  backfilled: number;
  fullFeedEnqueued: number;
  reclaimed: number;
  processed: number;
  completed: number;
  retryScheduled: number;
  deferred: number;
  failed: number;
  errors: number;
};

function emptyStats(): CycleStats {
  return {
    backfilled: 0,
    fullFeedEnqueued: 0,
    reclaimed: 0,
    processed: 0,
    completed: 0,
    retryScheduled: 0,
    deferred: 0,
    failed: 0,
    errors: 0,
  };
}

function recordOutcome(stats: CycleStats, result: Awaited<ReturnType<typeof dispatchSyncJob>>) {
  if (
    result.outcome === "created" ||
    result.outcome === "already_created" ||
    result.outcome === "sent" ||
    result.outcome === "synced" ||
    result.outcome === "nothing_to_send"
  ) {
    stats.completed += 1;
  } else if (result.outcome === "retry_scheduled") {
    stats.retryScheduled += 1;
  } else if (result.outcome === "deferred") {
    stats.deferred += 1;
  } else if (result.outcome === "failed") {
    stats.failed += 1;
  } else if (result.outcome === "error") {
    stats.errors += 1;
  }
}

async function runCycle(): Promise<CycleStats> {
  const stats = emptyStats();
  const shop = await resolveDefaultShop();

  stats.backfilled = await backfillProcessOrderJobs();
  if (stats.backfilled > 0) {
    await writeEventLog({
      shop,
      level: EVENT_LOG_LEVELS.INFO,
      category: EVENT_LOG_CATEGORIES.SYNC_JOB,
      eventName: "sync_job_backfill_enqueued",
      message: `Backfill enqueued ${stats.backfilled} process_order job(s).`,
      metadata: { count: stats.backfilled },
    });
  }

  stats.fullFeedEnqueued = await enqueueDailyFullFeedJobsIfDue();
  stats.reclaimed = await reclaimStaleSyncJobs();
  if (stats.reclaimed > 0) {
    await writeEventLog({
      shop,
      level: EVENT_LOG_LEVELS.WARN,
      category: EVENT_LOG_CATEGORIES.SYNC_JOB,
      eventName: "sync_job_stale_reclaimed",
      message: `Reclaimed ${stats.reclaimed} stale processing SyncJob(s).`,
      metadata: { count: stats.reclaimed },
    });
  }

  while (true) {
    const job = await claimNextDueSyncJob();
    if (!job) break;

    stats.processed += 1;

    try {
      const result = await dispatchSyncJob(job);
      recordOutcome(stats, result);
    } catch (error) {
      stats.errors += 1;
      console.error(`[run-jobs] Unhandled error on sync job ${job.id}:`, error);
      await writeEventLog({
        shop: job.shop,
        level: EVENT_LOG_LEVELS.ERROR,
        category: EVENT_LOG_CATEGORIES.SYNC_JOB,
        eventName: "sync_job_unhandled_error",
        message: `Unhandled error on SyncJob ${job.id} (${job.jobType}): ${error instanceof Error ? error.message : String(error)}`,
        syncJobId: job.id,
        metadata: { jobType: job.jobType },
      });
    }
  }

  console.log(
    `[run-jobs] Cycle done. backfilled=${stats.backfilled} fullFeedEnqueued=${stats.fullFeedEnqueued} reclaimed=${stats.reclaimed} processed=${stats.processed} completed=${stats.completed} retryScheduled=${stats.retryScheduled} deferred=${stats.deferred} failed=${stats.failed} errors=${stats.errors}`,
  );
  return stats;
}

let shuttingDown = false;

process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("[run-jobs] SIGINT received, shutting down after current cycle...");
});

process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log("[run-jobs] SIGTERM received, shutting down after current cycle...");
});

async function main() {
  const intervalMs = pollIntervalMs();
  console.log(
    `[run-jobs] Starting continuous worker (poll every ${intervalMs}ms). Press Ctrl+C to stop.`,
  );

  while (!shuttingDown) {
    try {
      await runCycle();
    } catch (err) {
      console.error("[run-jobs] Cycle error:", err);
    }

    if (shuttingDown) break;

    await sleep(intervalMs);
  }

  await disconnectPrisma();
  console.log("[run-jobs] Stopped.");
}

main().catch((err) => {
  console.error("[run-jobs] Fatal error:", err);
  process.exit(1);
});
