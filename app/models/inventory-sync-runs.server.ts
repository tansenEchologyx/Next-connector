import type { Prisma } from "@prisma/client";

import prisma from "../db.server";
import { listOpenInventorySyncIssues } from "./inventory-sync-issues.server";
import {
  INVENTORY_SYNC_PAGE_SIZES,
  hasActiveInventorySyncLogFilters,
  parseInventorySyncLogFilters,
  type InventorySyncLogFilters,
  type InventorySyncLogPageSize,
} from "../../shared/inventory-sync-log-filters";
import {
  INVENTORY_SYNC_RUN_STATUSES,
  INVENTORY_SYNC_STATUS_LABELS,
  INVENTORY_SYNC_TYPE_LABELS,
  LEGACY_INVENTORY_SYNC_RUN_STATUS_RETRYING,
  normalizeInventorySyncRunStatus,
  type InventorySyncRunStatus,
  type InventorySyncType,
} from "../../shared/inventory-sync-log";

export {
  hasActiveInventorySyncLogFilters,
  parseInventorySyncLogFilters,
  type InventorySyncLogFilters,
  type InventorySyncLogPageSize,
  INVENTORY_SYNC_PAGE_SIZES,
};

export type InventorySyncLogIssue = {
  id: number;
  type: string;
  syncType: string;
  message: string;
  createdAt: Date;
};

export type InventorySyncLogRow = {
  id: number;
  syncType: InventorySyncType;
  syncTypeLabel: string;
  status: InventorySyncRunStatus;
  statusLabel: string;
  eansAttempted: number;
  eansMarkedSent: number;
  skippedRace: number;
  errorMessage: string | null;
  nextRetryAt: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
  activeIssues: InventorySyncLogIssue[];
};

function buildWhere(
  shop: string,
  filters: InventorySyncLogFilters,
): Prisma.InventorySyncRunWhereInput {
  const where: Prisma.InventorySyncRunWhereInput = { shop };

  if (filters.type !== "all") {
    where.syncType = filters.type;
  }

  if (filters.status === "failed") {
    where.status = { in: ["failed", "retrying"] };
  } else if (filters.status !== "all") {
    where.status = filters.status;
  }

  return where;
}

function serializeRunIssues(
  run: {
    id: number;
    syncType: string;
    status: string;
    errorMessage: string | null;
    startedAt: Date;
  },
  openIssuesByType: Map<string, InventorySyncLogIssue[]>,
  latestProblematicRunIdByType: Map<string, number>,
): InventorySyncLogIssue[] {
  const isProblematic =
    run.status === INVENTORY_SYNC_RUN_STATUSES.FAILED ||
    run.status === LEGACY_INVENTORY_SYNC_RUN_STATUS_RETRYING ||
    run.status === INVENTORY_SYNC_RUN_STATUSES.PARTIAL;

  if (
    isProblematic &&
    latestProblematicRunIdByType.get(run.syncType) === run.id
  ) {
    const open = openIssuesByType.get(run.syncType) ?? [];
    if (open.length > 0) {
      return open;
    }
  }

  if (isProblematic && run.errorMessage) {
    return [
      {
        id: -run.id,
        type:
          run.status === INVENTORY_SYNC_RUN_STATUSES.PARTIAL
            ? "warning"
            : "error",
        syncType: run.syncType,
        message: run.errorMessage,
        createdAt: run.startedAt,
      },
    ];
  }

  return [];
}

export async function listInventorySyncRuns(
  shop: string,
  filters: InventorySyncLogFilters,
) {
  const where = buildWhere(shop, filters);
  const orderBy: Prisma.InventorySyncRunOrderByWithRelationInput = {
    startedAt: filters.sort === "oldest" ? "asc" : "desc",
  };

  const [total, runs, openIssues] = await Promise.all([
    prisma.inventorySyncRun.count({ where }),
    prisma.inventorySyncRun.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    listOpenInventorySyncIssues(shop),
  ]);

  const openIssuesByType = new Map<string, InventorySyncLogIssue[]>();
  for (const issue of openIssues) {
    const list = openIssuesByType.get(issue.syncType) ?? [];
    list.push({
      id: issue.id,
      type: issue.type,
      syncType: issue.syncType,
      message: issue.message,
      createdAt: issue.createdAt,
    });
    openIssuesByType.set(issue.syncType, list);
  }

  // Latest problematic run per sync type across the full shop (for attaching open issues).
  const latestProblematic = await prisma.inventorySyncRun.findMany({
    where: {
      shop,
      status: {
        in: [
          INVENTORY_SYNC_RUN_STATUSES.FAILED,
          LEGACY_INVENTORY_SYNC_RUN_STATUS_RETRYING,
          INVENTORY_SYNC_RUN_STATUSES.PARTIAL,
        ],
      },
    },
    orderBy: { startedAt: "desc" },
    distinct: ["syncType"],
    select: { id: true, syncType: true },
  });

  const latestProblematicRunIdByType = new Map<string, number>();
  for (const row of latestProblematic) {
    latestProblematicRunIdByType.set(row.syncType, row.id);
  }

  const rows: InventorySyncLogRow[] = runs.map((run) => {
    const syncType = run.syncType as InventorySyncType;
    const status = normalizeInventorySyncRunStatus(
      run.status,
    ) as InventorySyncRunStatus;

    return {
      id: run.id,
      syncType,
      syncTypeLabel: INVENTORY_SYNC_TYPE_LABELS[syncType] ?? run.syncType,
      status,
      statusLabel:
        INVENTORY_SYNC_STATUS_LABELS[status] ??
        String(status).toUpperCase(),
      eansAttempted: run.eansAttempted,
      eansMarkedSent: run.eansMarkedSent,
      skippedRace: run.skippedRace,
      errorMessage: run.errorMessage,
      nextRetryAt: run.nextRetryAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      activeIssues: serializeRunIssues(
        run,
        openIssuesByType,
        latestProblematicRunIdByType,
      ),
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return {
    runs: rows,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages,
    filters,
  };
}
