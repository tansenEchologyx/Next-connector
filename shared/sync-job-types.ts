export const SYNC_JOB_TYPES = {
  PROCESS_ORDER: "process_order",
  SEND_FULFILLMENT: "send_fulfillment",
  SEND_INVENTORY_DELTA: "send_inventory_delta",
} as const;

export type SyncJobType =
  (typeof SYNC_JOB_TYPES)[keyof typeof SYNC_JOB_TYPES];

export const SYNC_JOB_STATUSES = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type SyncJobStatus =
  (typeof SYNC_JOB_STATUSES)[keyof typeof SYNC_JOB_STATUSES];

export type ProcessOrderJobPayload = {
  kornitxOrderId: number;
};

export type SendFulfillmentJobPayload = {
  kornitxOrderId: number;
};

export type SendInventoryDeltaJobPayload = Record<string, never>;

export const SYNC_JOB_TYPE_PRIORITY: SyncJobType[] = [
  SYNC_JOB_TYPES.PROCESS_ORDER,
  SYNC_JOB_TYPES.SEND_FULFILLMENT,
  SYNC_JOB_TYPES.SEND_INVENTORY_DELTA,
];
