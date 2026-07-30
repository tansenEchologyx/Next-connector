export type InventoryVariantForFilter = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  barcode: string | null;
  isAvailable: boolean;
};

export type InventoryAvailabilityFilter = "all" | "available" | "unavailable";
export type InventoryTrackingFilter = "all" | "tracked" | "untracked";

export const INVENTORY_PAGE_SIZES = [10, 25, 50] as const;
export type InventoryPageSize = (typeof INVENTORY_PAGE_SIZES)[number];

export type InventoryListFilters = {
  q: string;
  availability: InventoryAvailabilityFilter;
  tracking: InventoryTrackingFilter;
  page: number;
  pageSize: InventoryPageSize;
};

export function parseInventoryListFilters(
  searchParams: URLSearchParams,
): InventoryListFilters {
  const availability = searchParams.get("availability");
  const tracking = searchParams.get("tracking");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const rawPageSize = Number(searchParams.get("pageSize") ?? "10");
  const pageSize = (INVENTORY_PAGE_SIZES as readonly number[]).includes(
    rawPageSize,
  )
    ? (rawPageSize as InventoryPageSize)
    : 10;

  return {
    q: searchParams.get("q") ?? "",
    availability:
      availability === "available" || availability === "unavailable"
        ? availability
        : "all",
    tracking:
      tracking === "tracked" || tracking === "untracked" ? tracking : "all",
    page,
    pageSize,
  };
}

export function hasActiveInventoryFilters(filters: InventoryListFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.availability !== "all" ||
    filters.tracking !== "all"
  );
}

export function filterInventoryVariants<T extends InventoryVariantForFilter>(
  variants: T[],
  filters: InventoryListFilters,
  trackedVariantIds: ReadonlySet<string>,
): T[] {
  const query = filters.q.trim().toLowerCase();

  return variants.filter((variant) => {
    const isTracked = trackedVariantIds.has(variant.variantId);

    if (filters.tracking === "tracked" && !isTracked) {
      return false;
    }
    if (filters.tracking === "untracked" && isTracked) {
      return false;
    }

    if (filters.availability === "available" && !variant.isAvailable) {
      return false;
    }
    if (filters.availability === "unavailable" && variant.isAvailable) {
      return false;
    }

    if (!query) return true;

    const haystack =
      `${variant.productTitle} ${variant.variantTitle} ${variant.sku ?? ""} ${variant.barcode ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function paginateInventoryVariants<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * pageSize;

  return {
    items: items.slice(skip, skip + pageSize),
    totalCount,
    page: safePage,
    pageSize,
    totalPages,
  };
}
