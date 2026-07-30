import { pickPrimaryLocation } from "../../app/services/shopify-inventory.server";
import { shopifyAdminGraphql } from "./shopify-graphql";

const VARIANT_CHUNK_SIZE = 50;

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

export async function fetchPrimaryLocationOffline(
  shop: string,
  accessToken: string,
): Promise<{ id: string; name: string } | null> {
  const data = await shopifyAdminGraphql<{
    locations: {
      nodes: Array<{ id: string; name: string; isPrimary?: boolean }>;
    };
  }>(
    shop,
    accessToken,
    `#graphql
      query ConnectorPrimaryLocationOffline {
        locations(first: 50) {
          nodes {
            id
            name
            isPrimary
          }
        }
      }`,
  );

  const primary = pickPrimaryLocation(
    (data.locations?.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.name,
      isPrimary: Boolean(node.isPrimary),
    })),
  );

  return primary ? { id: primary.id, name: primary.name } : null;
}

/**
 * Fetch available quantities at a location for specific variant GIDs.
 * Missing levels / GraphQL misses map to 0.
 */
export async function fetchVariantAvailableQuantities(
  shop: string,
  accessToken: string,
  variantIds: string[],
  locationId: string,
): Promise<Map<string, number>> {
  const quantities = new Map<string, number>();

  for (const variantId of variantIds) {
    quantities.set(variantId, 0);
  }

  for (let index = 0; index < variantIds.length; index += VARIANT_CHUNK_SIZE) {
    const chunk = variantIds.slice(index, index + VARIANT_CHUNK_SIZE);
    const data = await shopifyAdminGraphql<{
      nodes: Array<{
        id?: string;
        inventoryItem?: {
          inventoryLevel?: {
            quantities?: Array<{ quantity?: number | null }> | null;
          } | null;
        } | null;
      } | null>;
    }>(
      shop,
      accessToken,
      `#graphql
        query ConnectorVariantInventory(
          $ids: [ID!]!
          $locationId: ID!
        ) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              inventoryItem {
                inventoryLevel(locationId: $locationId) {
                  quantities(names: ["available"]) {
                    quantity
                  }
                }
              }
            }
          }
        }`,
      { ids: chunk, locationId },
    );

    for (const node of data.nodes ?? []) {
      if (!node?.id) continue;
      quantities.set(
        node.id,
        readAvailableQuantity(node.inventoryItem?.inventoryLevel ?? null),
      );
    }
  }

  return quantities;
}
