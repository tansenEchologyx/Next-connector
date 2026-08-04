import {
  INVENTORY_SYNC_RUN_STATUSES,
  INVENTORY_SYNC_TYPES,
  isInventorySyncRunStatus,
  isInventorySyncType,
  type InventorySyncRunStatus,
  type InventorySyncType,
} from "./inventory-sync-log";

export const INVENTORY_SYNC_PAGE_SIZES = [10, 25, 50] as const;
export type InventorySyncLogPageSize =
  (typeof INVENTORY_SYNC_PAGE_SIZES)[number];

export type InventorySyncLogFilters = {
  type: "all" | InventorySyncType;
  status: "all" | InventorySyncRunStatus;
  sort: "newest" | "oldest";
  page: number;
  pageSize: InventorySyncLogPageSize;
};

export function parseInventorySyncLogFilters(
  searchParams: URLSearchParams,
): InventorySyncLogFilters {
  const typeParam = searchParams.get("type") ?? "all";
  const statusParam = searchParams.get("status") ?? "all";
  const sortParam = searchParams.get("sort");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const rawPageSize = Number(searchParams.get("pageSize") ?? "10");
  const pageSize = (INVENTORY_SYNC_PAGE_SIZES as readonly number[]).includes(
    rawPageSize,
  )
    ? (rawPageSize as InventorySyncLogPageSize)
    : 10;

  return {
    type: isInventorySyncType(typeParam) ? typeParam : "all",
    status: isInventorySyncRunStatus(statusParam) ? statusParam : "all",
    sort: sortParam === "oldest" ? "oldest" : "newest",
    page,
    pageSize,
  };
}

export function hasActiveInventorySyncLogFilters(
  filters: InventorySyncLogFilters,
): boolean {
  return (
    filters.type !== "all" ||
    filters.status !== "all" ||
    filters.sort !== "newest"
  );
}

export {
  INVENTORY_SYNC_RUN_STATUSES,
  INVENTORY_SYNC_TYPES,
};
