type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type ShopifyLocation = {
  id: string;
  name: string;
};

export type ShopifyCustomer = {
  id: string;
  displayName: string;
  email: string | null;
};

export type ShopifyVariantRow = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  sku: string | null;
  barcode: string | null;
};

export async function fetchLocations(
  admin: AdminGraphql,
): Promise<ShopifyLocation[]> {
  const response = await admin.graphql(
    `#graphql
      query ConnectorLocations {
        locations(first: 50) {
          nodes {
            id
            name
          }
        }
      }`,
  );
  const json = await response.json();
  return json.data?.locations?.nodes ?? [];
}

export async function fetchCustomers(
  admin: AdminGraphql,
): Promise<ShopifyCustomer[]> {
  const response = await admin.graphql(
    `#graphql
      query ConnectorCustomers {
        customers(first: 50, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            displayName
            defaultEmailAddress {
              emailAddress
            }
          }
        }
      }`,
  );
  const json = await response.json();
  return (json.data?.customers?.nodes ?? []).map(
    (node: {
      id: string;
      displayName: string;
      defaultEmailAddress?: { emailAddress?: string | null } | null;
    }) => ({
      id: node.id,
      displayName: node.displayName,
      email: node.defaultEmailAddress?.emailAddress ?? null,
    }),
  );
}

export async function fetchProductVariants(
  admin: AdminGraphql,
): Promise<ShopifyVariantRow[]> {
  const rows: ShopifyVariantRow[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query ConnectorProductVariants($first: Int!, $after: String) {
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
                }
              }
            }
          }
        }`,
      {
        variables: {
          first: 50,
          after: cursor,
        },
      },
    );

    const json = await response.json();
    const products = json.data?.products;

    for (const product of products?.nodes ?? []) {
      for (const variant of product.variants?.nodes ?? []) {
        rows.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku ?? null,
          barcode: variant.barcode ?? null,
        });
      }
    }

    hasNextPage = Boolean(products?.pageInfo?.hasNextPage);
    cursor = products?.pageInfo?.endCursor ?? null;
  }

  return rows;
}
