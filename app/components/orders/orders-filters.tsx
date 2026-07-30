import { useEffect, useRef } from "react";
import { useSearchParams, useSubmit } from "react-router";

import type { OrderListFilters } from "../../models/kornitx-orders.server";
import styles from "./orders-page.module.css";

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

type OrdersFiltersProps = {
  filters: OrderListFilters;
};

export function hasActiveOrderFilters(filters: OrderListFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.status !== "all" ||
    filters.shape !== "all" ||
    filters.fulfillment !== "all" ||
    filters.sendFulfillment !== "all" ||
    filters.sort !== "oldest"
  );
}

export function OrdersFilters({ filters }: OrdersFiltersProps) {
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateParams = (updates: Record<string, string>, resetPage = true) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") {
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

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value });
    }, 300);
  };

  const clearFilters = () => {
    submit({}, { method: "get", replace: true });
  };

  return (
    <form className={styles.filterForm} method="get">
      <div className={styles.filterRow}>
        <div className={styles.filterSearch}>
          <s-search-field
            label="Search orders"
            name="q"
            placeholder="KornitX ID, Shopify order, brand..."
            value={filters.q}
            onChange={(event) => handleSearchChange(event.currentTarget.value)}
          />
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Order creation status"
            name="status"
            value={filters.status}
            onChange={(event) =>
              updateParams({ status: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="received">Received</s-option>
            <s-option value="processing">Processing</s-option>
            <s-option value="created">Created</s-option>
            <s-option value="failed">Failed</s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Shape"
            name="shape"
            value={filters.shape}
            onChange={(event) =>
              updateParams({ shape: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="single">Single</s-option>
            <s-option value="batched">Batched</s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Fulfillment"
            name="fulfillment"
            value={filters.fulfillment}
            onChange={(event) =>
              updateParams({ fulfillment: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="pending">Pending</s-option>
            <s-option value="unfulfilled">Unfulfilled</s-option>
            <s-option value="fulfilled">Fulfilled</s-option>
            <s-option value="partial">Partial</s-option>
            <s-option value="cancelled">Cancelled</s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Send fulfillment"
            name="sendFulfillment"
            value={filters.sendFulfillment}
            onChange={(event) =>
              updateParams({ sendFulfillment: readPolarisValue(event) })
            }
          >
            <s-option value="all">All</s-option>
            <s-option value="none">None</s-option>
            <s-option value="unsent">Unsent</s-option>
            <s-option value="sent">Sent</s-option>
            <s-option value="failed">Failed</s-option>
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
            <s-option value="newest">Date received (newest)</s-option>
            <s-option value="oldest">Date received (oldest)</s-option>
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
