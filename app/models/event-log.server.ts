import type { EventLog, Prisma } from "@prisma/client";

import prisma from "../db.server";
import { createdAtBoundsFromDateFilters } from "../../shared/event-log-date-range";
import type { EventLogFilters } from "../../shared/event-log-filters";
import {
  ADMIN_EVENT_LOG_PAGE_SIZE,
  type EventLogCategory,
  type EventLogLevel,
} from "../../shared/event-log";
import { formatUkDateTime } from "../../shared/uk-time";

export type WriteEventLogInput = {
  shop: string;
  level: EventLogLevel;
  category: EventLogCategory;
  eventName: string;
  message: string;
  kornitxOrderId?: string | null;
  shopifyOrderId?: string | null;
  shopifyOrderName?: string | null;
  syncJobId?: number | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type EventLogRow = {
  id: number;
  level: string;
  category: string;
  eventName: string;
  message: string;
  kornitxOrderId: string | null;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  syncJobId: number | null;
  metadata: unknown;
  createdAt: string;
  createdAtLabel: string;
};

export type EventLogPageResult = {
  events: EventLogRow[];
  nextCursor: number | null;
  hasMore: boolean;
  filters: EventLogFilters;
};

function serializeEventLogRow(row: EventLog): EventLogRow {
  return {
    id: row.id,
    level: row.level,
    category: row.category,
    eventName: row.eventName,
    message: row.message,
    kornitxOrderId: row.kornitxOrderId,
    shopifyOrderId: row.shopifyOrderId,
    shopifyOrderName: row.shopifyOrderName,
    syncJobId: row.syncJobId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    createdAtLabel: formatUkDateTime(row.createdAt),
  };
}

function buildEventLogWhere(
  shop: string,
  filters: EventLogFilters,
): Prisma.EventLogWhereInput {
  const where: Prisma.EventLogWhereInput = { shop };

  if (filters.level !== "all") {
    where.level = filters.level;
  }

  if (filters.category !== "all") {
    where.category = filters.category;
  }

  const q = filters.q.trim();
  if (q) {
    where.OR = [
      { kornitxOrderId: { contains: q, mode: "insensitive" } },
      { shopifyOrderName: { contains: q, mode: "insensitive" } },
      { shopifyOrderId: { contains: q, mode: "insensitive" } },
    ];
  }

  const dateBounds = createdAtBoundsFromDateFilters(
    filters.dateFrom,
    filters.dateTo,
  );
  if (dateBounds) {
    where.createdAt = dateBounds;
  }

  return where;
}

export async function writeEventLog(input: WriteEventLogInput) {
  return prisma.eventLog.create({
    data: {
      shop: input.shop,
      level: input.level,
      category: input.category,
      eventName: input.eventName,
      message: input.message,
      kornitxOrderId: input.kornitxOrderId ?? null,
      shopifyOrderId: input.shopifyOrderId ?? null,
      shopifyOrderName: input.shopifyOrderName ?? null,
      syncJobId: input.syncJobId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function fetchEventLogsPageForAdmin(
  shop: string,
  filters: EventLogFilters,
  cursor?: number | null,
): Promise<EventLogPageResult> {
  const where = buildEventLogWhere(shop, filters);
  const take = ADMIN_EVENT_LOG_PAGE_SIZE + 1;

  const rows = await prisma.eventLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = rows.length > ADMIN_EVENT_LOG_PAGE_SIZE;
  const pageRows = hasMore
    ? rows.slice(0, ADMIN_EVENT_LOG_PAGE_SIZE)
    : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    events: pageRows.map((row) => serializeEventLogRow(row)),
    nextCursor: last?.id ?? null,
    hasMore,
    filters,
  };
}
