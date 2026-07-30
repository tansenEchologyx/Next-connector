import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
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
  filterInventoryVariants,
  hasActiveInventoryFilters,
  parseInventoryListFilters,
} from "../../shared/inventory-list-filters";
import { InventoryFilters } from "../components/inventory/inventory-filters";
import { authenticate } from "../shopify.server";

type InventoryLoaderData = {
  variants: Awaited<ReturnType<typeof fetchProductVariantsWithInventory>>;
  trackedVariantIds: string[];
  locationLabel: string | null;
  locationMode: "primary" | "selected" | null;
  locationWarning: "no_location" | "primary_missing" | null;
};

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

function availabilityLabel(isAvailable: boolean): string {
  return isAvailable ? "Available" : "Unavailable";
}

export default function InventoryPage() {
  const { variants, trackedVariantIds, locationLabel, locationMode, locationWarning } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state !== "idle";

  const initialSelected = useMemo(
    () => new Set(trackedVariantIds),
    [trackedVariantIds],
  );
  const [selected, setSelected] = useState(initialSelected);
  const [searchParams] = useSearchParams();
  const filters = useMemo(
    () => parseInventoryListFilters(searchParams),
    [searchParams],
  );
  const [searchQuery, setSearchQuery] = useState(filters.q);

  useEffect(() => {
    setSearchQuery(filters.q);
  }, [filters.q]);

  const activeFilters = useMemo(
    () => ({ ...filters, q: searchQuery }),
    [filters, searchQuery],
  );

  const filteredVariants = useMemo(
    () => filterInventoryVariants(variants, activeFilters, selected),
    [variants, activeFilters, selected],
  );

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

  return (
    <s-page heading="Inventory sync">
      <Form method="post">
        <s-button
          slot="primary-action"
          type="submit"
          variant="primary"
          {...(isSaving ? { loading: true } : {})}
        >
          Save selection
        </s-button>

        {[...selected].map((variantId) => (
          <input
            key={variantId}
            type="hidden"
            name="variantIds"
            value={variantId}
          />
        ))}

        <s-section heading="Tracked products">
          {locationLabel ? (
            <s-paragraph>
              Stock at: <s-text type="strong">{locationLabel}</s-text>
              {locationMode === "primary" ? (
                <>
                  {" "}
                  — from <s-text type="strong">Use primary location</s-text> in
                  Settings
                </>
              ) : null}
            </s-paragraph>
          ) : null}

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
            <InventoryFilters
              filters={filters}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />
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
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Track</s-table-header>
                <s-table-header>Product</s-table-header>
                <s-table-header>Variant</s-table-header>
                <s-table-header>SKU</s-table-header>
                <s-table-header>EAN</s-table-header>
                <s-table-header>Qty</s-table-header>
                <s-table-header>Availability</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filteredVariants.map((variant) => {
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
                      <s-table-cell>{variant.availableQuantity}</s-table-cell>
                      <s-table-cell>
                        {availabilityLabel(variant.isAvailable)}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      </Form>

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>
            All barcoded variants in your store are listed; qty and availability
            come from the location in Settings.
          </s-list-item>
          <s-list-item>
            Out-of-stock items appear as Unavailable but can still be tracked.
          </s-list-item>
          <s-list-item>
            Inventory webhooks store unsent rows in the inventory delta table
            for tracked SKUs and enqueue one coalesced sync job.
          </s-list-item>
          <s-list-item>
            The unified <s-text type="strong">run-jobs</s-text> worker sends
            unsent deltas to KornitX when{" "}
            <s-text type="strong">INVENTORY_SYNC_INTERVAL_SECONDS</s-text> has
            elapsed since the last successful sync (default 1800 = 30 minutes).
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
