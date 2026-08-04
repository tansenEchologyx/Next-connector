export const INVENTORY_SYNC_TYPES = {
  DELTA: "delta",
  FULL_FEED: "full_feed",
} as const;

export type InventorySyncType =
  (typeof INVENTORY_SYNC_TYPES)[keyof typeof INVENTORY_SYNC_TYPES];

export const INVENTORY_SYNC_RUN_STATUSES = {
  SUCCESS: "success",
  PARTIAL: "partial",
  FAILED: "failed",
  DEFERRED: "deferred",
  SKIPPED: "skipped",
} as const;

export type InventorySyncRunStatus =
  (typeof INVENTORY_SYNC_RUN_STATUSES)[keyof typeof INVENTORY_SYNC_RUN_STATUSES];

/** Legacy status written before update-in-place; treat as failed in the UI. */
export const LEGACY_INVENTORY_SYNC_RUN_STATUS_RETRYING = "retrying";

export const INVENTORY_SYNC_ISSUE_TYPES = {
  ERROR: "error",
  WARNING: "warning",
} as const;

export const INVENTORY_SYNC_TYPE_LABELS: Record<InventorySyncType, string> = {
  delta: "Delta",
  full_feed: "Full feed",
};

export const INVENTORY_SYNC_STATUS_LABELS: Record<
  InventorySyncRunStatus,
  string
> = {
  success: "SUCCESS",
  partial: "PARTIAL",
  failed: "FAILED",
  deferred: "DEFERRED",
  skipped: "SKIPPED",
};

export function normalizeInventorySyncRunStatus(
  status: string,
): InventorySyncRunStatus | string {
  if (status === LEGACY_INVENTORY_SYNC_RUN_STATUS_RETRYING) {
    return INVENTORY_SYNC_RUN_STATUSES.FAILED;
  }
  return status;
}

export function isInventorySyncType(value: string): value is InventorySyncType {
  return (
    value === INVENTORY_SYNC_TYPES.DELTA ||
    value === INVENTORY_SYNC_TYPES.FULL_FEED
  );
}

export function isInventorySyncRunStatus(
  value: string,
): value is InventorySyncRunStatus {
  return Object.values(INVENTORY_SYNC_RUN_STATUSES).includes(
    value as InventorySyncRunStatus,
  );
}
