import { loadEnv } from "./lib/load-env";
import { disconnectPrisma } from "./lib/prisma";
import { completeJobRun, failJobRun, startJobRun } from "./lib/job-run";
import { enqueueDailyFullFeedJobsIfDue } from "../app/models/sync-jobs.server";

loadEnv();

/**
 * One-shot helper: enqueue due daily full-feed SyncJobs for today (UK schedule).
 * Actual sending is handled by `npm run worker:run-jobs`.
 */
async function main() {
  const jobRun = await startJobRun("stock-full-feed");

  try {
    const enqueued = await enqueueDailyFullFeedJobsIfDue();
    await completeJobRun(jobRun.id, { enqueued });
    console.log(
      `[stock-full-feed] Enqueued ${enqueued} daily full-feed job(s). Processing runs via worker:run-jobs.`,
    );
  } catch (err) {
    await failJobRun(jobRun.id, err);
    throw err;
  } finally {
    await disconnectPrisma();
  }
}

main().catch((err) => {
  console.error("[stock-full-feed] Fatal error:", err);
  process.exit(1);
});
