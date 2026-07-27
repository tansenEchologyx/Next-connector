const SHOPIFY_API_VERSION = "2025-10";

export type GraphqlUserError = {
  field?: string[] | null;
  message: string;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export async function shopifyAdminGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Shopify GraphQL HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const json = (await response.json()) as GraphqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).join("; ") || "GraphQL error",
    );
  }

  if (!json.data) {
    throw new Error("Shopify GraphQL returned no data");
  }

  return json.data;
}

export function formatUserErrors(errors: GraphqlUserError[]): string {
  return errors.map((error) => error.message).join("; ");
}
