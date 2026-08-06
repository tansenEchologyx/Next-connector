export const ADMIN_EVENT_LOG_PAGE_SIZE = 50;
export const EVENT_LOG_POLL_INTERVAL_MS = 30_000;
export const EVENT_LOG_SEARCH_DEBOUNCE_MS = 500;

export const EVENT_LOG_LEVELS = {
  INFO: "info",
  SUCCESS: "success",
  WARN: "warn",
  ERROR: "error",
} as const;

export type EventLogLevel =
  (typeof EVENT_LOG_LEVELS)[keyof typeof EVENT_LOG_LEVELS];

export const EVENT_LOG_CATEGORIES = {
  INVENTORY_DELTA: "inventory_delta",
  FULL_FEED_INVENTORY: "full_feed_inventory",
  ORDER_FROM_KORNITX: "order_from_kornitx",
  SYNC_JOB: "sync_job",
  SHIPMENT: "shipment",
} as const;

export type EventLogCategory =
  (typeof EVENT_LOG_CATEGORIES)[keyof typeof EVENT_LOG_CATEGORIES];

export const EVENT_LOG_CATEGORY_LABELS: Record<EventLogCategory, string> = {
  [EVENT_LOG_CATEGORIES.INVENTORY_DELTA]: "Inventory Delta",
  [EVENT_LOG_CATEGORIES.FULL_FEED_INVENTORY]: "Full feed inventory",
  [EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX]: "Order From Kornitx",
  [EVENT_LOG_CATEGORIES.SYNC_JOB]: "Syncjob",
  [EVENT_LOG_CATEGORIES.SHIPMENT]: "Shipment",
};

export const EVENT_LOG_LEVEL_LABELS: Record<EventLogLevel, string> = {
  [EVENT_LOG_LEVELS.INFO]: "Info",
  [EVENT_LOG_LEVELS.SUCCESS]: "Success",
  [EVENT_LOG_LEVELS.WARN]: "Warn",
  [EVENT_LOG_LEVELS.ERROR]: "Error",
};

const LEVEL_SET = new Set<string>(Object.values(EVENT_LOG_LEVELS));
const CATEGORY_SET = new Set<string>(Object.values(EVENT_LOG_CATEGORIES));

export function isEventLogLevel(value: string): value is EventLogLevel {
  return LEVEL_SET.has(value);
}

export function isEventLogCategory(value: string): value is EventLogCategory {
  return CATEGORY_SET.has(value);
}
