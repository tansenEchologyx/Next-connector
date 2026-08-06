import { ukLocalTimeToUtc } from "./uk-time";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoCalendarDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function parseDateRangePickerValue(value: string): {
  dateFrom: string;
  dateTo: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { dateFrom: "", dateTo: "" };

  const [fromRaw, toRaw] = trimmed.split("--");
  const dateFrom = fromRaw?.trim() ?? "";
  const dateTo = (toRaw?.trim() || dateFrom).trim();

  if (!parseIsoCalendarDate(dateFrom)) {
    return { dateFrom: "", dateTo: "" };
  }
  if (!parseIsoCalendarDate(dateTo)) {
    return { dateFrom, dateTo: dateFrom };
  }

  return { dateFrom, dateTo };
}

export function buildDateRangePickerValue(
  dateFrom: string,
  dateTo: string,
): string {
  if (!dateFrom) return "";
  if (!dateTo || dateTo === dateFrom) return dateFrom;
  return `${dateFrom}--${dateTo}`;
}

export function formatDateRangeDisplayLabel(
  dateFrom: string,
  dateTo: string,
): string {
  if (!dateFrom) return "All dates";

  const from = parseIsoCalendarDate(dateFrom);
  if (!from) return "All dates";

  const formatPart = (parts: { year: number; month: number; day: number }) =>
    new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short", year: "numeric" },
    );

  const to = parseIsoCalendarDate(dateTo || dateFrom);
  if (!to || dateTo === dateFrom) {
    return formatPart(from);
  }

  return `${formatPart(from)} – ${formatPart(to)}`;
}

export function createdAtBoundsFromDateFilters(
  dateFrom: string,
  dateTo: string,
): { gte?: Date; lt?: Date } | null {
  const fromParts = dateFrom ? parseIsoCalendarDate(dateFrom) : null;
  const toParts = dateTo
    ? parseIsoCalendarDate(dateTo)
    : fromParts
      ? fromParts
      : null;

  if (!fromParts && !toParts) return null;

  const startParts = fromParts ?? toParts!;
  const endParts = toParts ?? fromParts!;

  const gte = ukLocalTimeToUtc(
    startParts.year,
    startParts.month,
    startParts.day,
    0,
    0,
  );

  const endExclusive = ukLocalTimeToUtc(
    endParts.year,
    endParts.month,
    endParts.day + 1,
    0,
    0,
  );

  return { gte, lt: endExclusive };
}
