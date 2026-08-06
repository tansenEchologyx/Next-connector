import {
  isEventLogCategory,
  isEventLogLevel,
  type EventLogCategory,
  type EventLogLevel,
} from "./event-log";

export type EventLogFilters = {
  level: "all" | EventLogLevel;
  category: "all" | EventLogCategory;
  q: string;
  dateFrom: string;
  dateTo: string;
};

export function parseEventLogFilters(
  searchParams: URLSearchParams,
): EventLogFilters {
  const levelParam = searchParams.get("level") ?? "all";
  const categoryParam = searchParams.get("category") ?? "all";

  return {
    level: isEventLogLevel(levelParam) ? levelParam : "all",
    category: isEventLogCategory(categoryParam) ? categoryParam : "all",
    q: searchParams.get("q") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  };
}

export function hasActiveEventLogFilters(filters: EventLogFilters): boolean {
  return (
    filters.level !== "all" ||
    filters.category !== "all" ||
    filters.q.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== ""
  );
}

export function eventLogFiltersToSearchParams(
  filters: EventLogFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.level !== "all") params.set("level", filters.level);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return params;
}
