/** Production KornitX stock API (full URL). */
export const KORNITX_PRODUCTION_STOCK_URL =
  "https://api-sl-2-2.custom-gateway.net/stock/availability";

/** Production KornitX order-status API host (paths appended per order shape). */
export const KORNITX_PRODUCTION_ORDER_STATUS_BASE_URL =
  "https://api-sl-2-2.custom-gateway.net";

/**
 * Full URL for inventory/stock PUT.
 * Mock: https://next-connector.free.beeceptor.com/inventory
 * Prod:  https://api-sl-2-2.custom-gateway.net/stock/availability
 */
export function getKornitxStockUrl(): string {
  return (
    process.env.KORNITX_STOCK_URL?.trim() || KORNITX_PRODUCTION_STOCK_URL
  );
}

/**
 * When set, all shipping status calls use this single URL (mock/testing).
 * Mock: https://next-connector.free.beeceptor.com/shipment
 *
 * When unset, {@link getKornitxOrderStatusBaseUrl} is used with KornitX path rules.
 */
export function getKornitxShippingUrl(): string | null {
  const url = process.env.KORNITX_SHIPPING_URL?.trim();
  return url || null;
}

/** Base URL for real KornitX shipping APIs (single + batched paths). */
export function getKornitxOrderStatusBaseUrl(): string {
  return (
    process.env.KORNITX_ORDER_STATUS_BASE_URL?.trim() ||
    KORNITX_PRODUCTION_ORDER_STATUS_BASE_URL
  ).replace(/\/$/, "");
}

export function usesUnifiedShippingEndpoint(): boolean {
  return getKornitxShippingUrl() !== null;
}
