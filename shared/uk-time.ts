import type { AppSettings } from "@prisma/client";

import { isInventoryLocationConfigured } from "./inventory-location";

export const UK_TIMEZONE = "Europe/London";

export type UkDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type UkTimeOfDay = {
  hour: number;
  minute: number;
};

const UK_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatUkDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-GB", {
    timeZone: UK_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function parseUkTimeOfDay(value: string): UkTimeOfDay | null {
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function formatUkTimeOfDay(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getUkDateParts(date: Date): UkDateParts {
  const parts = Object.fromEntries(
    UK_PARTS_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const hourRaw = parts.hour === "24" ? "0" : parts.hour;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(hourRaw),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function formatUkCalendarDate(date: Date): string {
  const parts = getUkDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Convert a UK wall-clock date/time to a UTC Date (handles GMT/BST).
 */
export function ukLocalTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 2; i++) {
    const parts = getUkDateParts(new Date(utcMs));
    const asIfUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    utcMs += wanted - asIfUtc;
  }

  return new Date(utcMs);
}

export function getTodayUkScheduledInstant(
  hhmm: string,
  now = new Date(),
): Date | null {
  const time = parseUkTimeOfDay(hhmm);
  if (!time) return null;

  const parts = getUkDateParts(now);
  return ukLocalTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    time.hour,
    time.minute,
  );
}

export type DailyFullFeedSettings = Pick<
  AppSettings,
  | "dailyFullFeedEnabled"
  | "dailyFullFeedTime"
  | "lastDailyFullFeedAt"
  | "usePrimaryInventoryLocation"
  | "inventoryLocationId"
>;

export function isDailyFullFeedDue(
  settings: DailyFullFeedSettings,
  now = new Date(),
): boolean {
  if (!settings.dailyFullFeedEnabled) return false;
  if (!parseUkTimeOfDay(settings.dailyFullFeedTime)) return false;
  if (!isInventoryLocationConfigured(settings)) return false;

  const scheduled = getTodayUkScheduledInstant(settings.dailyFullFeedTime, now);
  if (!scheduled) return false;
  if (now.getTime() < scheduled.getTime()) return false;

  const last = settings.lastDailyFullFeedAt;
  if (!last) return true;

  return last.getTime() < scheduled.getTime();
}
