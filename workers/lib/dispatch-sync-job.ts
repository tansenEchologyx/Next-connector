import { SYNC_JOB_TYPES } from "../../shared/sync-job-types";
import { handleProcessOrderJob } from "./handlers/process-order-job";
import { handleSendFulfillmentJob } from "./handlers/send-fulfillment-job";
import { handleSendInventoryDeltaJob } from "./handlers/send-inventory-delta-job";

export async function dispatchSyncJob(
  job: import("@prisma/client").SyncJob,
) {
  switch (job.jobType) {
    case SYNC_JOB_TYPES.PROCESS_ORDER:
      return handleProcessOrderJob(job);
    case SYNC_JOB_TYPES.SEND_FULFILLMENT:
      return handleSendFulfillmentJob(job);
    case SYNC_JOB_TYPES.SEND_INVENTORY_DELTA:
      return handleSendInventoryDeltaJob(job);
    default:
      throw new Error(`Unknown sync job type: ${job.jobType}`);
  }
}
