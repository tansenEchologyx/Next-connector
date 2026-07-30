import { useEffect, useRef } from "react";
import { useSearchParams, useSubmit } from "react-router";

import type { InventoryListFilters } from "../../../shared/inventory-list-filters";
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

type InventoryFiltersProps = {
  filters: InventoryListFilters;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

export function InventoryFilters({
  filters,
  searchQuery,
  onSearchQueryChange,
}: InventoryFiltersProps) {
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Filter changes always restart at page 1.
    params.delete("page");
    submit(params, { method: "get", replace: true });
  };

  const handleSearchTyping = (value: string) => {
    // Filter the table immediately (client-side).
    onSearchQueryChange(value);
    // Sync URL after a short pause for shareable/bookmarkable state.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value });
    }, 300);
  };

  const clearFilters = () => {
    onSearchQueryChange("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const params = new URLSearchParams();
    const pageSize = searchParams.get("pageSize");
    if (pageSize && pageSize !== "10") {
      params.set("pageSize", pageSize);
    }
    submit(params, { method: "get", replace: true });
  };

  return (
    <div className={styles.filterForm}>
      <div className={styles.filterRow}>
        <div className={styles.filterSearch}>
          <label className={styles.searchLabel} htmlFor="inventory-search">
            Search inventory
          </label>
          <input
            id="inventory-search"
            className={styles.searchInput}
            type="search"
            placeholder="Product name, SKU, or barcode"
            value={searchQuery}
            onChange={(event) => handleSearchTyping(event.currentTarget.value)}
            autoComplete="off"
          />
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Availability"
            value={filters.availability}
            onChange={(event) =>
              updateParams({ availability: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="available">Available</s-option>
            <s-option value="unavailable">Unavailable</s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Tracking"
            value={filters.tracking}
            onChange={(event) =>
              updateParams({ tracking: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="tracked">Tracked</s-option>
            <s-option value="untracked">Untracked</s-option>
          </s-select>
        </div>

        <div className={styles.filterClear}>
          <s-button type="button" variant="tertiary" onClick={clearFilters}>
            Clear
          </s-button>
        </div>
      </div>
    </div>
  );
}
