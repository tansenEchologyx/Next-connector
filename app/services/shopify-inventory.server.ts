import type { AdminGraphql, ShopifyVariantRow } from "./shopify-admin.server";

export type ShopifyVariantWithInventory = ShopifyVariantRow & {
  availableQuantity: number;
  isAvailable: boolean;
};

type AdminGraphqlClient = AdminGraphql;

function readAvailableQuantity(
  inventoryLevel: {
    quantities?: Array<{ quantity?: number | null }> | null;
  } | null,
): number {
  const quantity = inventoryLevel?.quantities?.[0]?.quantity;
  if (quantity === undefined || quantity === null || quantity < 0) {
    return 0;
  }
  return quantity;
}

export function pickPrimaryLocation<
  T extends { id: string; isPrimary: boolean },
>(locations: T[]): T | null {
  if (locations.length === 0) return null;
  return locations.find((location) => location.isPrimary) ?? locations[0] ?? null;
}

export async function fetchPrimaryLocation(
  admin: AdminGraphqlClient,
): Promise<{ id: string; name: string } | null> {
  const response = await admin.graphql(
    `#graphql
      query ConnectorPrimaryLocation {
        locations(first: 50) {
          nodes {
            id
            name
            isPrimary
          }
        }
      }`,
  );
  const json = await response.json();
  const nodes = (json.data?.locations?.nodes ?? []) as Array<{
    id: string;
    name: string;
    isPrimary?: boolean;
  }>;

  const primary = pickPrimaryLocation(
    nodes.map((node) => ({
      id: node.id,
      name: node.name,
      isPrimary: Boolean(node.isPrimary),
    })),
  );

  return primary ? { id: primary.id, name: primary.name } : null;
}

export async function fetchProductVariantsWithInventory(
  admin: AdminGraphqlClient,
  locationId: string,
): Promise<ShopifyVariantWithInventory[]> {
  const rows: ShopifyVariantWithInventory[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query ConnectorProductVariantsInventory(
          $first: Int!
          $after: String
          $locationId: ID!
        ) {
          products(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              variants(first: 100) {
                nodes {
                  id
                  title
                  sku
                  barcode
                  inventoryItem {
                    inventoryLevel(locationId: $locationId) {
                      quantities(names: ["available"]) {
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          first: 50,
          after: cursor,
          locationId,
        },
      },
    );

    const json = await response.json();
    const products = json.data?.products;

    for (const product of products?.nodes ?? []) {
      for (const variant of product.variants?.nodes ?? []) {
        if (!variant.barcode) continue;

        const availableQuantity = readAvailableQuantity(
          variant.inventoryItem?.inventoryLevel ?? null,
        );

        rows.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku ?? null,
          barcode: variant.barcode ?? null,
          availableQuantity,
          isAvailable: availableQuantity > 0,
        });
      }
    }

    hasNextPage = Boolean(products?.pageInfo?.hasNextPage);
    cursor = products?.pageInfo?.endCursor ?? null;
  }

  return rows;
}
