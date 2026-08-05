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
 * Base URL for KornitX shipping APIs (single + batched paths).
 * Mock: https://next-connector.free.beeceptor.com
 *   → PUT /order/:id/status
 *   → PUT /order-item/status
 * Prod:  https://api-sl-2-2.custom-gateway.net
 */
export function getKornitxOrderStatusBaseUrl(): string {
  return (
    process.env.KORNITX_ORDER_STATUS_BASE_URL?.trim() ||
    KORNITX_PRODUCTION_ORDER_STATUS_BASE_URL
  ).replace(/\/$/, "");
}
