import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  getTrackedVariantIds,
  syncTrackedProducts,
} from "../models/tracked-products.server";
import { fetchProductVariants } from "../services/shopify-admin.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const [variants, trackedVariantIds] = await Promise.all([
    fetchProductVariants(admin),
    getTrackedVariantIds(session.shop),
  ]);

  return {
    variants: variants.filter((variant) => Boolean(variant.barcode)),
    trackedVariantIds: [...trackedVariantIds],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const selectedIds = new Set(formData.getAll("variantIds").map(String));
  const variants = await fetchProductVariants(admin);

  const selectedVariants = variants
    .filter(
      (variant) => selectedIds.has(variant.variantId) && variant.barcode,
    )
    .map((variant) => ({
      variantId: variant.variantId,
      ean: variant.barcode!,
      sku: variant.sku,
      productTitle: `${variant.productTitle} — ${variant.variantTitle}`,
    }));

  await syncTrackedProducts(session.shop, selectedVariants);
  return { ok: true as const, trackedCount: selectedVariants.length };
};

export default function InventoryPage() {
  const { variants, trackedVariantIds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state !== "idle";

  const initialSelected = useMemo(
    () => new Set(trackedVariantIds),
    [trackedVariantIds],
  );
  const [selected, setSelected] = useState(initialSelected);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show(`Tracking ${actionData.trackedCount} variants`);
    }
  }, [actionData?.ok, actionData?.trackedCount, shopify]);

  const filteredVariants = variants.filter((variant) => {
    const haystack =
      `${variant.productTitle} ${variant.variantTitle} ${variant.sku ?? ""} ${variant.barcode ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

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
          <s-paragraph>
            Select variants with a barcode (EAN). Only checked products send stock
            updates to KornitX.
          </s-paragraph>
          <s-search-field
            label="Search products"
            name="query"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search by title, SKU, or EAN"
            labelAccessibilityVisibility="exclusive"
          />

          {filteredVariants.length === 0 ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text>
                No variants with barcodes found. Add barcodes in Shopify to track
                inventory here.
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
