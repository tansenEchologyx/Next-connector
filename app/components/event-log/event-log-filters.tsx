import { useEffect, useRef, useState } from "react";
import { useSearchParams, useSubmit } from "react-router";

import { FilterDateRangeField } from "../layout/filter-date-range-field";
import { PopoverHideTrigger } from "../layout/popover-hide-trigger";
import {
  buildDateRangePickerValue,
  formatDateRangeDisplayLabel,
  parseDateRangePickerValue,
} from "../../../shared/event-log-date-range";
import type { EventLogFilters } from "../../../shared/event-log-filters";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_CATEGORY_LABELS,
  EVENT_LOG_LEVELS,
  EVENT_LOG_LEVEL_LABELS,
  EVENT_LOG_SEARCH_DEBOUNCE_MS,
} from "../../../shared/event-log";
import styles from "./event-log-page.module.css";

const DATE_RANGE_POPOVER_ID = "event-log-date-range-popover";

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

type EventLogFiltersBarProps = {
  filters: EventLogFilters;
};

export function EventLogFiltersBar({ filters }: EventLogFiltersBarProps) {
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [datePickerValue, setDatePickerValue] = useState(() =>
    buildDateRangePickerValue(filters.dateFrom, filters.dateTo),
  );
  const [hideDatePopover, setHideDatePopover] = useState(false);

  useEffect(() => {
    setDatePickerValue(
      buildDateRangePickerValue(filters.dateFrom, filters.dateTo),
    );
  }, [filters.dateFrom, filters.dateTo]);

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
    submit(params, { method: "get", replace: true });
  };

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value });
    }, EVENT_LOG_SEARCH_DEBOUNCE_MS);
  };

  const handleDateRangeChange = (value: string) => {
    setDatePickerValue(value);
    if (!value.includes("--")) return;

    const { dateFrom, dateTo } = parseDateRangePickerValue(value);
    if (!dateFrom) return;

    setHideDatePopover(false);
    queueMicrotask(() => setHideDatePopover(true));
    updateParams({ dateFrom, dateTo: dateTo || dateFrom });
  };

  const clearFilters = () => {
    submit({}, { method: "get", replace: true });
  };

  const dateLabel = formatDateRangeDisplayLabel(
    filters.dateFrom,
    filters.dateTo,
  );

  return (
    <form className={styles.filterForm} method="get">
      <div className={styles.filterRow}>
        <div className={styles.filterField}>
          <s-select
            label="Level"
            name="level"
            value={filters.level}
            onChange={(event) =>
              updateParams({ level: readPolarisValue(event) })
            }
          >
            <s-option value="all">All levels</s-option>
            <s-option value={EVENT_LOG_LEVELS.ERROR}>
              {EVENT_LOG_LEVEL_LABELS.error}
            </s-option>
            <s-option value={EVENT_LOG_LEVELS.SUCCESS}>
              {EVENT_LOG_LEVEL_LABELS.success}
            </s-option>
            <s-option value={EVENT_LOG_LEVELS.WARN}>
              {EVENT_LOG_LEVEL_LABELS.warn}
            </s-option>
            <s-option value={EVENT_LOG_LEVELS.INFO}>
              {EVENT_LOG_LEVEL_LABELS.info}
            </s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <s-select
            label="Category"
            name="category"
            value={filters.category}
            onChange={(event) =>
              updateParams({ category: readPolarisValue(event) })
            }
          >
            <s-option value="all">All categories</s-option>
            <s-option value={EVENT_LOG_CATEGORIES.INVENTORY_DELTA}>
              {EVENT_LOG_CATEGORY_LABELS.inventory_delta}
            </s-option>
            <s-option value={EVENT_LOG_CATEGORIES.FULL_FEED_INVENTORY}>
              {EVENT_LOG_CATEGORY_LABELS.full_feed_inventory}
            </s-option>
            <s-option value={EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX}>
              {EVENT_LOG_CATEGORY_LABELS.order_from_kornitx}
            </s-option>
            <s-option value={EVENT_LOG_CATEGORIES.SYNC_JOB}>
              {EVENT_LOG_CATEGORY_LABELS.sync_job}
            </s-option>
            <s-option value={EVENT_LOG_CATEGORIES.SHIPMENT}>
              {EVENT_LOG_CATEGORY_LABELS.shipment}
            </s-option>
          </s-select>
        </div>

        <div className={styles.filterField}>
          <FilterDateRangeField
            label="Date range"
            displayValue={dateLabel}
            popoverId={DATE_RANGE_POPOVER_ID}
          />
          <s-popover id={DATE_RANGE_POPOVER_ID}>
            <s-box padding="base">
              <s-date-picker
                type="range"
                value={datePickerValue}
                onChange={(event) =>
                  handleDateRangeChange(readPolarisValue(event))
                }
              />
            </s-box>
          </s-popover>
          <PopoverHideTrigger
            popoverId={DATE_RANGE_POPOVER_ID}
            active={hideDatePopover}
          />
        </div>

        <div className={styles.filterSearch}>
          <s-search-field
            label="Order search"
            name="q"
            placeholder="Order #, Shopify id, or internal id"
            value={filters.q}
            onInput={(event) => handleSearchChange(readPolarisValue(event))}
          />
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
