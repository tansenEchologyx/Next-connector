import prisma from "../db.server";
import { shopifyAdminGraphql } from "../../workers/lib/shopify-graphql";

export async function getOfflineAccessToken(shop: string): Promise<string> {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
  });

  if (!session) {
    throw new Error(`No offline session for shop ${shop}`);
  }

  return session.accessToken;
}

export async function lookupVariantByInventoryItemId(
  shop: string,
  accessToken: string,
  inventoryItemId: number,
) {
  const gid = `gid://shopify/InventoryItem/${inventoryItemId}`;
  const data = await shopifyAdminGraphql<{
    inventoryItem: {
      variant: {
        id: string;
        barcode: string | null;
      } | null;
    } | null;
  }>(
    shop,
    accessToken,
    `#graphql
      query ConnectorInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          variant {
            id
            barcode
          }
        }
      }`,
    { id: gid },
  );

  return data.inventoryItem?.variant ?? null;
}
