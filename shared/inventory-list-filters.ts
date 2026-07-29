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

export type InventoryListFilters = {
  q: string;
  availability: InventoryAvailabilityFilter;
  tracking: InventoryTrackingFilter;
};

export function parseInventoryListFilters(
  searchParams: URLSearchParams,
): InventoryListFilters {
  const availability = searchParams.get("availability");
  const tracking = searchParams.get("tracking");
  return {
    q: searchParams.get("q") ?? "",
    availability:
      availability === "available" || availability === "unavailable"
        ? availability
        : "all",
    tracking:
      tracking === "tracked" || tracking === "untracked" ? tracking : "all",
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
