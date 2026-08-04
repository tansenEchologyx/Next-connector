import { useSearchParams, useSubmit } from "react-router";

import type { InventorySyncLogFilters } from "../../../shared/inventory-sync-log-filters";
import styles from "./inventory-page.module.css";

function readPolarisValue(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const e = event as {
    currentTarget?: { value?: string } | null;
    target?: { value?: string } | null;
    detail?: { value?: string };
  };
  if (e.detail?.value != null) return String(e.detail.value);
  const el = e.currentTarget ?? e.target;
  if (el && typeof el.value === "string") return el.value;
  return "";
}

type SyncLogFiltersProps = {
  filters: InventorySyncLogFilters;
};

export function SyncLogFilters({ filters }: SyncLogFiltersProps) {
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  const updateParams = (updates: Record<string, string>, resetPage = true) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "sort" && value === "newest")) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    if (resetPage) {
      params.delete("page");
    }
    submit(params, { method: "get", replace: true });
  };

  const clearFilters = () => {
    submit({}, { method: "get", replace: true });
  };

  return (
    <form className={styles.filterForm} method="get">
      <div className={styles.filterRow}>
        <div className={styles.filterField}>
          <s-select
            label="Sync type"
            name="type"
            value={filters.type}
            onChange={(event) =>
              updateParams({ type: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="delta">Delta</s-option>
            <s-option value="full_feed">Full feed</s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Status"
            name="status"
            value={filters.status}
            onChange={(event) =>
              updateParams({ status: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="success">Success</s-option>
            <s-option value="partial">Partial</s-option>
            <s-option value="failed">Failed</s-option>
            <s-option value="deferred">Deferred</s-option>
            <s-option value="skipped">Skipped</s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Sort by"
            name="sort"
            value={filters.sort}
            onChange={(event) =>
              updateParams({ sort: readPolarisValue(event) })
            }
          >
            <s-option value="newest">Started (newest)</s-option>
            <s-option value="oldest">Started (oldest)</s-option>
          </s-select>
        </div>

        <div className={styles.filterClear}>
          <s-button type="button" variant="tertiary" onClick={clearFilters}>
            Clear
          </s-button>
        </div>
      </div>
    </form>
  );
}
