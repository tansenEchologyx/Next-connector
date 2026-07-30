import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InventoryVariantForFilter } from "./inventory-list-filters";
import {
  paginateInventoryVariants,
  parseInventoryListFilters,
  sortInventoryVariantsWithTrackedFirst,
} from "./inventory-list-filters";

function variant(
  partial: Pick<
    InventoryVariantForFilter,
    "variantId" | "productTitle" | "variantTitle"
  >,
): InventoryVariantForFilter {
  return {
    ...partial,
    sku: null,
    barcode: null,
    isAvailable: true,
  };
}

describe("parseInventoryListFilters", () => {
  it("defaults trackedFirst to false when param is absent", () => {
    const filters = parseInventoryListFilters(new URLSearchParams());
    assert.equal(filters.trackedFirst, false);
  });

  it("parses trackedFirst=1 as true", () => {
    const filters = parseInventoryListFilters(
      new URLSearchParams("trackedFirst=1"),
    );
    assert.equal(filters.trackedFirst, true);
  });
});

describe("sortInventoryVariantsWithTrackedFirst", () => {
  it("puts saved tracked variants first", () => {
    const variants = [
      variant({
        variantId: "v1",
        productTitle: "Alpha",
        variantTitle: "S",
      }),
      variant({
        variantId: "v2",
        productTitle: "Beta",
        variantTitle: "M",
      }),
      variant({
        variantId: "v3",
        productTitle: "Gamma",
        variantTitle: "L",
      }),
    ];

    const sorted = sortInventoryVariantsWithTrackedFirst(
      variants,
      new Set(["v3", "v1"]),
    );

    assert.deepEqual(
      sorted.map((row) => row.variantId),
      ["v1", "v3", "v2"],
    );
  });

  it("sorts by product then variant title within tracked and untracked groups", () => {
    const variants = [
      variant({
        variantId: "u2",
        productTitle: "Zebra",
        variantTitle: "B",
      }),
      variant({
        variantId: "t2",
        productTitle: "Tee",
        variantTitle: "XL",
      }),
      variant({
        variantId: "u1",
        productTitle: "Apple",
        variantTitle: "A",
      }),
      variant({
        variantId: "t1",
        productTitle: "Tee",
        variantTitle: "S",
      }),
    ];

    const sorted = sortInventoryVariantsWithTrackedFirst(
      variants,
      new Set(["t1", "t2"]),
    );

    assert.deepEqual(
      sorted.map((row) => row.variantId),
      ["t1", "t2", "u1", "u2"],
    );
  });

  it("does not mutate the input array", () => {
    const variants = [
      variant({
        variantId: "v1",
        productTitle: "B",
        variantTitle: "1",
      }),
      variant({
        variantId: "v2",
        productTitle: "A",
        variantTitle: "1",
      }),
    ];
    const originalOrder = variants.map((row) => row.variantId);

    sortInventoryVariantsWithTrackedFirst(variants, new Set(["v1"]));

    assert.deepEqual(
      variants.map((row) => row.variantId),
      originalOrder,
    );
  });
});

describe("paginateInventoryVariants", () => {
  it("slices the requested page and reports totals", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const result = paginateInventoryVariants(items, 2, 3);

    assert.deepEqual(result.items, [4, 5, 6]);
    assert.equal(result.totalCount, 7);
    assert.equal(result.page, 2);
    assert.equal(result.pageSize, 3);
    assert.equal(result.totalPages, 3);
  });

  it("clamps page when it is past the last page", () => {
    const result = paginateInventoryVariants([1, 2, 3], 99, 2);

    assert.deepEqual(result.items, [3]);
    assert.equal(result.page, 2);
    assert.equal(result.totalPages, 2);
  });

  it("returns empty items and page 1 when the list is empty", () => {
    const result = paginateInventoryVariants([], 3, 10);

    assert.deepEqual(result.items, []);
    assert.equal(result.page, 1);
    assert.equal(result.totalPages, 1);
    assert.equal(result.totalCount, 0);
  });
});
