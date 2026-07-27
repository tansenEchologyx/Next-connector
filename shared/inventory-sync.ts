import type { AppSettings } from "@prisma/client";

/** 30 minutes — used when INVENTORY_SYNC_INTERVAL_SECONDS is unset or invalid. */
export const DEFAULT_INVENTORY_SYNC_INTERVAL_SECONDS = 30 * 60;

export function getInventorySyncIntervalSeconds(): number {
  const raw = process.env.INVENTORY_SYNC_INTERVAL_SECONDS?.trim();
  if (!raw) {
    return DEFAULT_INVENTORY_SYNC_INTERVAL_SECONDS;
  }

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    console.warn(
      `[inventory-sync] Invalid INVENTORY_SYNC_INTERVAL_SECONDS="${raw}"; using ${DEFAULT_INVENTORY_SYNC_INTERVAL_SECONDS}s`,
    );
    return DEFAULT_INVENTORY_SYNC_INTERVAL_SECONDS;
  }

  return seconds;
}

export function getInventorySyncIntervalMs(): number {
  return getInventorySyncIntervalSeconds() * 1000;
}

export function computeInventoryRunAfter(
  settings: AppSettings | null,
  now = Date.now(),
): Date {
  const intervalMs = getInventorySyncIntervalMs();
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
