import type { AppSettings } from "@prisma/client";

/** Default delta cadence in minutes when settings value is missing/invalid. */
export const DEFAULT_INVENTORY_DELTA_INTERVAL_MINUTES = 30;

export function getInventoryDeltaIntervalMinutes(
  settings: Pick<AppSettings, "deltaIntervalMinutes"> | null,
): number {
  const minutes = settings?.deltaIntervalMinutes;
  if (
    typeof minutes !== "number" ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return DEFAULT_INVENTORY_DELTA_INTERVAL_MINUTES;
  }
  return minutes;
}

export function getInventorySyncIntervalMs(
  settings: Pick<AppSettings, "deltaIntervalMinutes"> | null,
): number {
  return getInventoryDeltaIntervalMinutes(settings) * 60 * 1000;
}

export function computeInventoryRunAfter(
  settings: AppSettings | null,
  now = Date.now(),
): Date {
  const intervalMs = getInventorySyncIntervalMs(settings);
  const lastSync = settings?.lastInventorySyncAt;

  if (!lastSync) {
    return new Date(now);
  }

  return new Date(Math.max(now, lastSync.getTime() + intervalMs));
}

export function isInventorySyncDue(
  settings: AppSettings | null,
  now = Date.now(),
): boolean {
  return computeInventoryRunAfter(settings, now).getTime() <= now;
}
