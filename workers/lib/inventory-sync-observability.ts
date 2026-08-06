import type { Prisma } from "@prisma/client";

import {
  createInventorySyncIssue,
  upsertInventorySyncRun,
  closeOpenLifecycleInventorySyncRuns,
  resolveInventorySyncIssuesByType,
  upsertOpenInventorySyncIssue,
  INVENTORY_SYNC_ISSUE_TYPES,
} from "../../app/models/inventory-sync-issues.server";
import {
  INVENTORY_SYNC_RUN_STATUSES,
  INVENTORY_SYNC_TYPE_LABELS,
  type InventorySyncType,
} from "../../shared/inventory-sync-log";
import {
  buildInventoryConfigFailureMessage,
  buildInventorySyncPartialFailureMessage,
  buildInventorySyncRetryMessage,
} from "../../shared/order-processing-issues";
import { writeInventorySyncEventLog } from "../../shared/event-log-inventory";

export type RecordInventorySyncOutcomeInput = {
  shop: string;
  syncType: InventorySyncType;
  status: string;
  eansAttempted?: number;
  eansMarkedSent?: number;
  skippedRace?: number;
  errorMessage?: string | null;
  nextRetryAt?: Date | null;
  syncJobId?: number | null;
  startedAt?: Date;
  finishedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  /**
   * When true, always insert a new run (fresh send cycle, or delta partial).
   * Mid-backoff retries (SyncJob.attemptCount > 0) should leave this false
   * so the open failed row is updated in place.
   */
  forceCreate?: boolean;
  /** When set, upserts or resolves open shop issues for this sync type. */
  issue?: {
    kind: "retry" | "partial" | "terminal" | "resolve";
    attemptCount?: number;
    nextRunAt?: Date;
    isConfigError?: boolean;
  };
};

function syncLabel(syncType: InventorySyncType): string {
  return INVENTORY_SYNC_TYPE_LABELS[syncType] === "Full feed"
    ? "Inventory full feed"
    : "Inventory delta sync";
}

export async function recordInventorySyncOutcome(
  input: RecordInventorySyncOutcomeInput,
) {
  // Fresh cycles must not attach to a stale open row from an earlier cycle.
  if (input.forceCreate && input.syncJobId != null) {
    await closeOpenLifecycleInventorySyncRuns(input.syncJobId);
  }

  const run = await upsertInventorySyncRun({
    shop: input.shop,
    syncType: input.syncType,
    status: input.status,
    eansAttempted: input.eansAttempted,
    eansMarkedSent: input.eansMarkedSent,
    skippedRace: input.skippedRace,
    errorMessage: input.errorMessage,
    nextRetryAt: input.nextRetryAt ?? null,
    syncJobId: input.syncJobId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    metadata: input.metadata,
    forceCreate: input.forceCreate,
  });

  if (!input.issue) {
    await writeInventorySyncEventLog(input);
    return run;
  }

  const label = syncLabel(input.syncType);
  const errorText = input.errorMessage ?? `${label} failed.`;

  if (input.issue.kind === "resolve") {
    await resolveInventorySyncIssuesByType(input.shop, input.syncType);
    await writeInventorySyncEventLog(input);
    return run;
  }

  if (input.issue.kind === "partial") {
    const nextRunAt =
      input.issue.nextRunAt ?? input.nextRetryAt ?? new Date();
    await upsertOpenInventorySyncIssue(
      input.shop,
      input.syncType,
      INVENTORY_SYNC_ISSUE_TYPES.WARNING,
      buildInventorySyncPartialFailureMessage(label, errorText, nextRunAt),
    );
    await writeInventorySyncEventLog(input);
    return run;
  }

  if (input.issue.kind === "retry") {
    const attemptCount = input.issue.attemptCount ?? 1;
    const nextRunAt =
      input.issue.nextRunAt ?? input.nextRetryAt ?? new Date();
    await upsertOpenInventorySyncIssue(
      input.shop,
      input.syncType,
      INVENTORY_SYNC_ISSUE_TYPES.ERROR,
      buildInventorySyncRetryMessage(
        label,
        errorText,
        attemptCount,
        nextRunAt,
      ),
    );
    await writeInventorySyncEventLog(input);
    return run;
  }

  // terminal — no nextRetryAt on the run
  const terminalMessage = input.issue.isConfigError
    ? buildInventoryConfigFailureMessage(label, errorText)
    : errorText;

  await createInventorySyncIssue(
    input.shop,
    input.syncType,
    INVENTORY_SYNC_ISSUE_TYPES.ERROR,
    terminalMessage,
  );

  await writeInventorySyncEventLog(input);
  return run;
}

export { INVENTORY_SYNC_RUN_STATUSES };
