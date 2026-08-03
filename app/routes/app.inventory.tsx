import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getOrCreateAppSettings } from "../models/app-settings.server";
import {
  getTrackedVariantIds,
  syncTrackedProducts,
} from "../models/tracked-products.server";
import {
  fetchPrimaryLocation,
  fetchProductVariantsWithInventory,
} from "../services/shopify-inventory.server";
import { fetchLocations } from "../services/shopify-admin.server";
import { resolveEffectiveInventoryLocation } from "../../shared/inventory-location";
import {
  areAllInventoryVariantsSelected,
  filterInventoryVariants,
  hasActiveInventoryFilters,
  paginateInventoryVariants,
  parseInventoryListFilters,
  selectAllInventoryVariantIds,
  sortInventoryVariantsWithTrackedFirst,
} from "../../shared/inventory-list-filters";
import { InventoryFilters } from "../components/inventory/inventory-filters";
import styles from "../components/inventory/inventory-page.module.css";
import { authenticate } from "../shopify.server";

type InventoryLoaderData = {
  variants: Awaited<ReturnType<typeof fetchProductVariantsWithInventory>>;
  trackedVariantIds: string[];
  locationLabel: string | null;
  locationMode: "primary" | "selected" | null;
  locationWarning: "no_location" | "primary_missing" | null;
};

function readPolarisValue(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const e = event as {
    currentTarget?: { value?: string } | null;
    target?: { value?: string } | null;
    detail?: { value?: string };
  };
  if (e.detail?.value != null) return String(e.detail.value);
  const el = e.currentTarget ?? e.target;
  if (el && typeof el.value === "string") return el.value;
  return "";
}

function readPolarisChecked(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const e = event as {
    currentTarget?: { checked?: boolean } | null;
    target?: { checked?: boolean } | null;
    detail?: { checked?: boolean };
  };
  if (e.detail?.checked != null) return Boolean(e.detail.checked);
  const el = e.currentTarget ?? e.target;
  if (el && typeof el.checked === "boolean") return el.checked;
  return false;
}

async function loadInventoryForShop(
  admin: Parameters<typeof fetchProductVariantsWithInventory>[0],
  shop: string,
): Promise<InventoryLoaderData> {
  const [settings, trackedVariantIds] = await Promise.all([
    getOrCreateAppSettings(shop),
    getTrackedVariantIds(shop),
  ]);

  const effective = resolveEffectiveInventoryLocation(settings);

  if (effective.mode === "primary") {
    const primary = await fetchPrimaryLocation(admin);
    if (!primary) {
      return {
        variants: [],
        trackedVariantIds: [...trackedVariantIds],
        locationLabel: null,
        locationMode: null,
        locationWarning: "primary_missing",
      };
    }

    const variants = await fetchProductVariantsWithInventory(
      admin,
      primary.id,
    );
    return {
      variants,
      trackedVariantIds: [...trackedVariantIds],
      locationLabel: `${primary.name} (Primary)`,
      locationMode: "primary",
      locationWarning: null,
    };
  }

  if (!effective.locationId) {
    return {
      variants: [],
      trackedVariantIds: [...trackedVariantIds],
      locationLabel: null,
      locationMode: null,
      locationWarning: "no_location",
    };
  }

  const locations = await fetchLocations(admin);
  const selected = locations.find(
    (location) => location.id === effective.locationId,
  );

  const variants = await fetchProductVariantsWithInventory(
    admin,
    effective.locationId,
  );

  return {
    variants,
    trackedVariantIds: [...trackedVariantIds],
    locationLabel: selected?.name ?? "Selected location",
    locationMode: "selected",
    locationWarning: null,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  return loadInventoryForShop(admin, session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const selectedIds = new Set(formData.getAll("variantIds").map(String));
  const { variants } = await loadInventoryForShop(admin, session.shop);

  const selectedVariants = variants
    .filter((variant) => selectedIds.has(variant.variantId))
    .map((variant) => ({
      variantId: variant.variantId,
      ean: variant.barcode!,
      sku: variant.sku,
      productTitle: `${variant.productTitle} — ${variant.variantTitle}`,
    }));

  await syncTrackedProducts(session.shop, selectedVariants);
  return { ok: true as const, trackedCount: selectedVariants.length };
};

/** Skip Shopify re-fetch when only client-side list URL params change. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod !== "GET") {
    return defaultShouldRevalidate;
  }

  const stripClientListParams = (url: URL) => {
    const params = new URLSearchParams(url.searchParams);
    params.delete("page");
    params.delete("pageSize");
    params.delete("trackedFirst");
    params.delete("q");
    params.delete("availability");
    params.delete("tracking");
    return params.toString();
  };

  if (stripClientListParams(currentUrl) === stripClientListParams(nextUrl)) {
    return false;
  }

  return defaultShouldRevalidate;
}

function availabilityLabel(isAvailable: boolean): string {
  return isAvailable ? "Available" : "Unavailable";
}

export default function InventoryPage() {
  const { variants, trackedVariantIds, locationLabel, locationMode, locationWarning } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const isSaving = navigation.state === "submitting";
  const isLoading = navigation.state === "loading";

  // Draft selection: init once from DB; preserve across search/filter/pagination.
  const [selected, setSelected] = useState(
    () => new Set(trackedVariantIds),
  );
  const filters = useMemo(
    () => parseInventoryListFilters(searchParams),
    [searchParams],
  );
  const [searchQuery, setSearchQuery] = useState(filters.q);

  useEffect(() => {
    setSearchQuery(filters.q);
  }, [filters.q]);

  // Sync draft checkboxes from DB only after a successful Save.
  useEffect(() => {
    if (actionData?.ok) {
      setSelected(new Set(trackedVariantIds));
    }
  }, [actionData?.ok, trackedVariantIds]);

  const activeFilters = useMemo(
    () => ({ ...filters, q: searchQuery }),
    [filters, searchQuery],
  );

  const savedTrackedIds = useMemo(
    () => new Set(trackedVariantIds),
    [trackedVariantIds],
  );

  const allSelected = useMemo(
    () => areAllInventoryVariantsSelected(selected, variants),
    [selected, variants],
  );

  const sortedVariants = useMemo(() => {
    if (!filters.trackedFirst) return variants;
    return sortInventoryVariantsWithTrackedFirst(variants, savedTrackedIds);
  }, [variants, savedTrackedIds, filters.trackedFirst]);

  const filteredVariants = useMemo(
    () => filterInventoryVariants(sortedVariants, activeFilters, selected),
    [sortedVariants, activeFilters, selected],
  );

  const {
    items: pageVariants,
    page,
    pageSize,
    totalPages,
  } = useMemo(() => {
    // While search is typing ahead of the URL, show page 1 of the live filter.
    const pageForSlice =
      searchQuery !== filters.q ? 1 : filters.page;
    return paginateInventoryVariants(
      filteredVariants,
      pageForSlice,
      filters.pageSize,
    );
  }, [
    filteredVariants,
    filters.page,
    filters.pageSize,
    filters.q,
    searchQuery,
  ]);

  const filtersActive = hasActiveInventoryFilters(activeFilters);

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show(`Tracking ${actionData.trackedCount} variants`);
    }
  }, [actionData?.ok, actionData?.trackedCount, shopify]);

  const toggleVariant = (variantId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(variantId);
      } else {
        next.delete(variantId);
      }
      return next;
    });
  };

  const handleHeaderSelectAllChange = (checked: boolean) => {
    if (checked) {
      setSelected(selectAllInventoryVariantIds(variants));
    } else {
      setSelected(new Set());
    }
  };

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    submit(params, { method: "get", replace: true });
  };

  const handlePageSizeChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "10") {
      params.delete("pageSize");
    } else {
      params.set("pageSize", value);
    }
    params.delete("page");
    submit(params, { method: "get", replace: true });
  };

  return (
    <s-page heading="Inventory sync" inlineSize="large">
      <Form method="post">
        {[...selected].map((variantId) => (
          <input
            key={variantId}
            type="hidden"
            name="variantIds"
            value={variantId}
          />
        ))}

        <div className={styles.page}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLocation}>
              {locationLabel ? (
                <s-paragraph>
                  Stock at: <s-text type="strong">{locationLabel}</s-text>
                  {locationMode === "primary" ? (
                    <>
                      {" "}
                      — from{" "}
                      <s-text type="strong">Use primary location</s-text> in
                      Settings
                    </>
                  ) : null}
                </s-paragraph>
              ) : null}
            </div>
            <div className={styles.toolbarAction}>
              <s-button
                type="submit"
                variant="primary"
                {...(isSaving ? { loading: true } : {})}
              >
                Save selection
              </s-button>
            </div>
          </div>

          {locationWarning === "no_location" ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text>
                Select an inventory location in Settings, or enable &quot;Use
                primary location&quot;.
              </s-text>
            </s-box>
          ) : null}

          {locationWarning === "primary_missing" ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text>
                No Shopify location found. Add a location in Shopify admin or
                select a specific location in Settings.
              </s-text>
            </s-box>
          ) : null}

          <s-paragraph>
            All barcoded variants in your store are listed. Qty and availability
            reflect the configured location. Only checked products send stock
            updates to KornitX.
          </s-paragraph>

          {!locationWarning ? (
            <div className={styles.filterCard}>
              <InventoryFilters
                filters={filters}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
              />
            </div>
          ) : null}

          {locationWarning ? null : variants.length === 0 ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text>
                No variants with barcodes found. Add barcodes in Shopify to
                track inventory here.
              </s-text>
            </s-box>
          ) : filteredVariants.length === 0 ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text>
                {filtersActive
                  ? "No variants match your search or availability filter."
                  : "No variants with barcodes found."}
              </s-text>
            </s-box>
          ) : (
            <div className={styles.tableCard}>
              <div className={styles.tableWrap}>
                <s-table variant="auto" loading={isLoading}>
                  <s-table-header-row>
                    <s-table-header listSlot="primary">
                      <span className={styles.trackHeader}>
                        <s-checkbox
                          checked={allSelected}
                          onChange={(event) =>
                            handleHeaderSelectAllChange(
                              readPolarisChecked(event),
                            )
                          }
                          label="Track"
                        />
                      </span>
                    </s-table-header>
                    <s-table-header>Product</s-table-header>
                    <s-table-header>Variant</s-table-header>
                    <s-table-header>SKU</s-table-header>
                    <s-table-header>EAN</s-table-header>
                    <s-table-header>Qty</s-table-header>
                    <s-table-header>Availability</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {pageVariants.map((variant) => {
                      const checked = selected.has(variant.variantId);
                      return (
                        <s-table-row key={variant.variantId}>
                          <s-table-cell>
                            <s-checkbox
                              checked={checked}
                              onChange={(event) =>
                                toggleVariant(
                                  variant.variantId,
                                  event.currentTarget.checked,
                                )
                              }
                              label={`Track ${variant.productTitle}`}
                            />
                          </s-table-cell>
                          <s-table-cell>{variant.productTitle}</s-table-cell>
                          <s-table-cell>{variant.variantTitle}</s-table-cell>
                          <s-table-cell>{variant.sku ?? "—"}</s-table-cell>
                          <s-table-cell>{variant.barcode}</s-table-cell>
                          <s-table-cell>
                            {variant.availableQuantity}
                          </s-table-cell>
                          <s-table-cell>
                            {availabilityLabel(variant.isAvailable)}
                          </s-table-cell>
                        </s-table-row>
                      );
                    })}
                  </s-table-body>
                </s-table>
              </div>

              <div className={styles.footer}>
                <div className={styles.pageSize}>
                  <div className={styles.pageSizeSelect}>
                    <s-select
                      label="Variants per page"
                      labelAccessibilityVisibility="exclusive"
                      value={String(pageSize)}
                      onChange={(event) =>
                        handlePageSizeChange(readPolarisValue(event))
                      }
                    >
                      <s-option value="10">10</s-option>
                      <s-option value="25">25</s-option>
                      <s-option value="50">50</s-option>
                    </s-select>
                  </div>
                  <span className={styles.pageSizeLabel}>
                    variants per page
                  </span>
                </div>

                <div className={styles.pagination}>
                  <s-button
                    type="button"
                    variant="secondary"
                    disabled={page <= 1 || isLoading ? true : undefined}
                    onClick={() => goToPage(page - 1)}
                  >
                    Previous
                  </s-button>
                  <span className={styles.paginationStatus}>
                    Page {page} of {totalPages}
                  </span>
                  <s-button
                    type="button"
                    variant="secondary"
                    disabled={
                      page >= totalPages || isLoading ? true : undefined
                    }
                    onClick={() => goToPage(page + 1)}
                  >
                    Next
                  </s-button>
                </div>
              </div>
            </div>
          )}

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text type="strong">How it works</s-text>
              <s-unordered-list>
                <s-list-item>
                  All barcoded variants in your store are listed; qty and
                  availability come from the location in Settings.
                </s-list-item>
                <s-list-item>
                  Out-of-stock items appear as Unavailable but can still be
                  tracked.
                </s-list-item>
                <s-list-item>
                  Inventory webhooks store unsent rows in the inventory delta
                  table for tracked SKUs and enqueue one coalesced sync job.
                </s-list-item>
                <s-list-item>
                  The unified <s-text type="strong">run-jobs</s-text> worker
                  sends unsent deltas to KornitX using the{" "}
                  <s-text type="strong">Inventory delta interval</s-text> set in
                  Settings (default 30 minutes).
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-box>
        </div>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
