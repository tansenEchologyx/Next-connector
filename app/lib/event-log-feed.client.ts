import type { EventLogRow } from "../models/event-log.server";

export function mergeEventLogFeedDisplay(
  head: EventLogRow[],
  tail: EventLogRow[],
): EventLogRow[] {
  const seen = new Set<number>();
  const merged: EventLogRow[] = [];

  for (const row of head) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }

  for (const row of tail) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }

  return merged;
}

export function appendEventLogTailPage(
  tail: EventLogRow[],
  page: EventLogRow[],
): EventLogRow[] {
  return mergeEventLogFeedDisplay(tail, page);
}

export function moveDisplacedHeadToTail(
  previousHead: EventLogRow[],
  nextHead: EventLogRow[],
  tail: EventLogRow[],
): EventLogRow[] {
  const nextHeadIds = new Set(nextHead.map((row) => row.id));
  const displaced = previousHead.filter((row) => !nextHeadIds.has(row.id));
  return mergeEventLogFeedDisplay(displaced, tail);
}
