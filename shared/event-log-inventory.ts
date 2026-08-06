import type { Prisma } from "@prisma/client";

import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../shared/event-log";
import {
  INVENTORY_SYNC_RUN_STATUSES,
  INVENTORY_SYNC_TYPES,
  type InventorySyncType,
} from "./inventory-sync-log";
import { formatUkDateTime } from "./uk-time";

import type { WriteEventLogInput } from "../app/models/event-log.server";
import { writeEventLog } from "../app/models/event-log.server";

type InventorySyncEventInput = {
  shop: string;
  syncType: InventorySyncType;
  status: string;
  eansAttempted?: number;
  eansMarkedSent?: number;
  errorMessage?: string | null;
  nextRetryAt?: Date | null;
  syncJobId?: number | null;
  metadata?: Prisma.InputJsonValue | null;
  issue?: {
    kind: "retry" | "partial" | "terminal" | "resolve";
    attemptCount?: number;
    nextRunAt?: Date;
    isConfigError?: boolean;
  };
};

function syncCategory(syncType: InventorySyncType) {
  return syncType === INVENTORY_SYNC_TYPES.DELTA
    ? EVENT_LOG_CATEGORIES.INVENTORY_DELTA
    : EVENT_LOG_CATEGORIES.FULL_FEED_INVENTORY;
}

function syncLabel(syncType: InventorySyncType): string {
  return syncType === INVENTORY_SYNC_TYPES.FULL_FEED
    ? "Full feed inventory"
    : "Inventory delta";
}

export async function writeInventorySyncEventLog(
  input: InventorySyncEventInput,
) {
  const category = syncCategory(input.syncType);
  const label = syncLabel(input.syncType);
  const prefix =
    input.syncType === INVENTORY_SYNC_TYPES.DELTA ? "inventory_delta" : "full_feed";
  const base: Omit<WriteEventLogInput, "level" | "eventName" | "message"> = {
    shop: input.shop,
    category,
    syncJobId: input.syncJobId ?? null,
    metadata: input.metadata ?? undefined,
  };

  if (input.status === INVENTORY_SYNC_RUN_STATUSES.DEFERRED) {
    const nextAt = input.nextRetryAt
      ? formatUkDateTime(input.nextRetryAt)
      : "the next interval";
    await writeEventLog({
      ...base,
      level: EVENT_LOG_LEVELS.INFO,
      eventName: `${prefix}_sync_deferred`,
      message: `${label} deferred — waiting until ${nextAt}.`,
    });
    return;
  }

  if (input.status === INVENTORY_SYNC_RUN_STATUSES.SKIPPED) {
    const reason =
      input.metadata &&
      typeof input.metadata === "object" &&
      !Array.isArray(input.metadata) &&
      typeof (input.metadata as Record<string, unknown>).reason === "string"
        ? String((input.metadata as Record<string, unknown>).reason)
        : "nothing_to_send";

    const eventName =
      reason === "daily_full_feed_disabled"
        ? "full_feed_skipped_disabled"
        : reason === "no_tracked_products"
          ? "full_feed_skipped_no_products"
          : reason === "no_remaining_eans"
            ? "full_feed_skipped_no_remaining"
            : `${prefix}_sync_skipped`;

    await writeEventLog({
      ...base,
      level: EVENT_LOG_LEVELS.INFO,
      eventName,
      message: `${label} skipped (${reason.replaceAll("_", " ")}).`,
    });
    return;
  }

  if (input.status === INVENTORY_SYNC_RUN_STATUSES.SUCCESS) {
    const count = input.eansMarkedSent ?? input.eansAttempted ?? 0;
    await writeEventLog({
      ...base,
      level: EVENT_LOG_LEVELS.SUCCESS,
      eventName: `${prefix}_sync_success`,
      message: `${label} succeeded — ${count} EAN(s) marked sent.`,
    });
    return;
  }

  if (input.status === INVENTORY_SYNC_RUN_STATUSES.PARTIAL) {
    const nextAt = input.nextRetryAt ?? input.issue?.nextRunAt;
    const nextLabel = nextAt ? formatUkDateTime(nextAt) : "the next interval";
    await writeEventLog({
      ...base,
      level: EVENT_LOG_LEVELS.WARN,
      eventName: `${prefix}_sync_partial`,
      message: `${label} partially failed — ${input.eansMarkedSent ?? 0}/${input.eansAttempted ?? 0} EAN(s) sent. Next retry at ${nextLabel}.`,
    });
    return;
  }

  if (input.status === INVENTORY_SYNC_RUN_STATUSES.FAILED) {
    const errorText = input.errorMessage ?? `${label} failed.`;
    if (input.issue?.kind === "terminal") {
      await writeEventLog({
        ...base,
        level: EVENT_LOG_LEVELS.ERROR,
        eventName: `${prefix}_sync_failed_terminal`,
        message: `${label} terminally failed — ${errorText}`,
      });
      return;
    }

    const nextAt = input.nextRetryAt ?? input.issue?.nextRunAt;
    const nextLabel = nextAt ? formatUkDateTime(nextAt) : "soon";
    const attempt = input.issue?.attemptCount ?? 1;
    await writeEventLog({
      ...base,
      level: EVENT_LOG_LEVELS.WARN,
      eventName: `${prefix}_sync_failed_retry`,
      message: `${label} failed (attempt ${attempt}) — ${errorText} Next retry at ${nextLabel}.`,
    });
  }
}

export async function writeFullFeedEnqueuedEventLog(shop: string, ukDate: string) {
  await writeEventLog({
    shop,
    level: EVENT_LOG_LEVELS.INFO,
    category: EVENT_LOG_CATEGORIES.FULL_FEED_INVENTORY,
    eventName: "full_feed_enqueued",
    message: `Daily full feed job enqueued for ${ukDate}.`,
  });
}
