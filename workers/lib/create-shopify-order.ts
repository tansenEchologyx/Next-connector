import type { AppSettings, KornitxOrder, KornitxOrderItem } from "@prisma/client";

import { normalizePreemptiveOrderPrefix } from "../../app/models/app-settings.server";
import { formatUserErrors, shopifyAdminGraphql } from "./shopify-graphql";
import type { OrderShippingAddress } from "./resolve-shipping-address";

type VariantLookupResult = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  price: string;
};

type CreatedShopifyLineItem = {
  id: string;
  variantId: string | null;
};

export type CreateShopifyOrderResult = {
  shopifyOrderId: string;
  shopifyOrderName: string;
  lineItemMappings: Array<{
    kornitxItemId: string;
    shopifyLineItemId: string;
  }>;
};

export async function lookupVariantByEan(
  shop: string,
  accessToken: string,
  ean: string,
): Promise<VariantLookupResult | null> {
  const data = await shopifyAdminGraphql<{
    productVariants: {
      nodes: Array<{
        id: string;
        sku: string | null;
        title: string;
        price: string;
        product: { title: string };
      }>;
    };
  }>(
    shop,
    accessToken,
    `#graphql
      query ConnectorVariantByBarcode($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            sku
            title
            price
            product {
              title
            }
          }
        }
      }`,
    { query: `barcode:${ean}` },
  );

  const variant = data.productVariants.nodes[0];
  if (!variant) return null;

  return {
    variantId: variant.id,
    productTitle: variant.product.title,
    variantTitle: variant.title,
    sku: variant.sku,
    price: variant.price,
  };
}

async function getShopCurrencyCode(
  shop: string,
  accessToken: string,
): Promise<string> {
  const data = await shopifyAdminGraphql<{ shop: { currencyCode: string } }>(
    shop,
    accessToken,
    `#graphql
      query ConnectorShopCurrency {
        shop {
          currencyCode
        }
      }`,
  );
  return data.shop.currencyCode;
}

function buildLineItemPriceSet(
  price: string,
  shopCurrency: string,
  orderCurrency: string,
) {
  const priceSet: Record<string, unknown> = {
    shopMoney: {
      amount: price,
      currencyCode: shopCurrency,
    },
  };

  if (orderCurrency !== shopCurrency) {
    priceSet.presentmentMoney = {
      amount: price,
      currencyCode: orderCurrency,
    };
  }

  return priceSet;
}

function isPreemptiveRef(
  orderExternalRef: string,
  prefix: string | null,
): boolean {
  if (!prefix) return false;
  return orderExternalRef.toUpperCase().startsWith(prefix);
}

function buildOrderTags(
  order: KornitxOrder,
  items: KornitxOrderItem[],
  preemptivePrefix: string | null,
): string[] {
  const tags = ["kornitx", "next-label-plus", "NXTLabel", "NXT-"];
  const externalRefs = [...new Set(items.map((item) => item.orderExternalRef))];

  for (const ref of externalRefs) {
    tags.push(`ext-ref:${ref}`);
  }

  const hasPreemptive = items.some((item) =>
    isPreemptiveRef(item.orderExternalRef, preemptivePrefix),
  );
  const hasLive = items.some(
    (item) => !isPreemptiveRef(item.orderExternalRef, preemptivePrefix),
  );

  if (hasPreemptive) tags.push("next-preemptive");
  if (hasLive || !hasPreemptive) tags.push("next-live");

  tags.push(`kornitx-id:${order.kornitxId}`);
  return tags;
}

/** Shopify order name so Torque can filter Next Label Plus orders from web orders. */
export function buildNxtOrderName(kornitxId: string): string {
  return `NXT-${kornitxId}`;
}

function matchLineItems(
  items: KornitxOrderItem[],
  variantByItemId: Map<string, string>,
  shopifyLineItems: CreatedShopifyLineItem[],
): Array<{ kornitxItemId: string; shopifyLineItemId: string }> {
  const usedLineItemIds = new Set<string>();
  const mappings: Array<{ kornitxItemId: string; shopifyLineItemId: string }> =
    [];

  for (const item of items) {
    const variantId = variantByItemId.get(item.itemId);
    if (!variantId) {
      throw new Error(`Missing variant mapping for KornitX item ${item.itemId}`);
    }

    const match = shopifyLineItems.find(
      (lineItem) =>
        lineItem.variantId === variantId && !usedLineItemIds.has(lineItem.id),
    );

    if (!match) {
      throw new Error(
        `Could not match Shopify line item for KornitX item ${item.itemId} (EAN ${item.ean})`,
      );
    }

    usedLineItemIds.add(match.id);
    mappings.push({
      kornitxItemId: item.itemId,
      shopifyLineItemId: match.id,
    });
  }

  return mappings;
}

export async function createShopifyOrderFromKornitx(
  shop: string,
  accessToken: string,
  settings: AppSettings,
  order: KornitxOrder,
  items: KornitxOrderItem[],
  shippingAddress: OrderShippingAddress | null,
): Promise<CreateShopifyOrderResult> {
  const variantByItemId = new Map<string, string>();
  const lineItemsInput: Array<Record<string, unknown>> = [];
  const shopCurrency = await getShopCurrencyCode(shop, accessToken);
  const orderCurrency = order.currency;
  const usePresentmentCurrency = orderCurrency !== shopCurrency;
  const preemptivePrefix = normalizePreemptiveOrderPrefix(
    settings.preemptiveOrderPrefix,
  );

  for (const item of items) {
    const variant = await lookupVariantByEan(shop, accessToken, item.ean);
    if (!variant) {
      throw new Error(
        `No Shopify variant found with barcode/EAN ${item.ean} for KornitX item ${item.itemId}`,
      );
    }

    variantByItemId.set(item.itemId, variant.variantId);
    lineItemsInput.push({
      variantId: variant.variantId,
      quantity: item.quantity,
      requiresShipping: true,
      priceSet: buildLineItemPriceSet(
        variant.price,
        shopCurrency,
        orderCurrency,
      ),
      properties: [
        { name: "kornitx_item_id", value: item.itemId },
        { name: "order_external_ref", value: item.orderExternalRef },
        { name: "kornitx_ean", value: item.ean },
        { name: "promise_date", value: item.promiseDate },
      ],
    });
  }

  const promiseDate = items[0]?.promiseDate ?? "";

  const data = await shopifyAdminGraphql<{
    orderCreate: {
      order: {
        id: string;
        name: string;
        lineItems: {
          nodes: Array<{
            id: string;
            variant: { id: string } | null;
          }>;
        };
      } | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    shop,
    accessToken,
    `#graphql
      mutation ConnectorOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          order {
            id
            name
            lineItems(first: 100) {
              nodes {
                id
                variant {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      order: {
        name: buildNxtOrderName(order.kornitxId),
        currency: usePresentmentCurrency ? shopCurrency : orderCurrency,
        ...(usePresentmentCurrency
          ? { presentmentCurrency: orderCurrency }
          : {}),
        customer: {
          toAssociate: {
            id: settings.b2bCustomerId,
          },
        },
        ...(shippingAddress
          ? {
              shippingAddress: {
                firstName: shippingAddress.firstName,
                lastName: shippingAddress.lastName,
                company: shippingAddress.company,
                address1: shippingAddress.address1,
                address2: shippingAddress.address2,
                city: shippingAddress.city,
                province: shippingAddress.province,
                zip: shippingAddress.zip,
                countryCode: shippingAddress.countryCode,
                phone: shippingAddress.phone,
              },
            }
          : {}),
        lineItems: lineItemsInput,
        tags: buildOrderTags(order, items, preemptivePrefix),
        note: `KornitX batch ${order.kornitxId} (${order.orderShape})`,
        sourceName: "kornitx",
        sourceIdentifier: order.kornitxId,
        processedAt: order.dateTimeStamp.toISOString(),
        metafields: [
          {
            namespace: "kornitx",
            key: "batch_id",
            type: "single_line_text_field",
            value: order.kornitxId,
          },
          {
            namespace: "kornitx",
            key: "destination",
            type: "single_line_text_field",
            value: order.destination,
          },
          {
            namespace: "kornitx",
            key: "promise_date",
            type: "single_line_text_field",
            value: promiseDate,
          },
          {
            namespace: "kornitx",
            key: "order_shape",
            type: "single_line_text_field",
            value: order.orderShape,
          },
        ],
      },
      options: {
        inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
    },
  );

  const userErrors = data.orderCreate.userErrors;
  if (userErrors.length > 0) {
    throw new Error(formatUserErrors(userErrors));
  }

  const createdOrder = data.orderCreate.order;
  if (!createdOrder) {
    throw new Error("Shopify orderCreate returned no order");
  }

  const shopifyLineItems = createdOrder.lineItems.nodes.map((lineItem) => ({
    id: lineItem.id,
    variantId: lineItem.variant?.id ?? null,
  }));

  return {
    shopifyOrderId: createdOrder.id,
    shopifyOrderName: createdOrder.name,
    lineItemMappings: matchLineItems(items, variantByItemId, shopifyLineItems),
  };
}
