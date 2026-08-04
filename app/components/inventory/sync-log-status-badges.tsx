import { formatUkDateTime } from "../../../shared/uk-time";
import {
  INVENTORY_SYNC_RUN_STATUSES,
  type InventorySyncRunStatus,
} from "../../../shared/inventory-sync-log";

export function syncRunStatusTone(
  status: InventorySyncRunStatus | string,
): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case INVENTORY_SYNC_RUN_STATUSES.SUCCESS:
      return "success";
    case INVENTORY_SYNC_RUN_STATUSES.PARTIAL:
    case INVENTORY_SYNC_RUN_STATUSES.DEFERRED:
      return "warning";
    case INVENTORY_SYNC_RUN_STATUSES.FAILED:
    case "retrying":
      return "critical";
    default:
      return "info";
  }
}

export function formatSyncRunDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return formatUkDateTime(value);
}

export function issueTypeLabel(type: string): string {
  return type.toUpperCase();
}

export function issueTypeTone(
  type: string,
): "success" | "warning" | "critical" | "info" {
  return type === "error" ? "critical" : "warning";
}
