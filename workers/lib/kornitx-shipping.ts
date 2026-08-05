import type { AppSettings } from "@prisma/client";

import type { ShippingStatusEvent, KornitxOrder } from "@prisma/client";

import {
  kornitxBasicAuthHeader,
  loadKornitxApiCredentials,
  parseKornitxHttpResponse,
} from "../../shared/kornitx-credentials";
import { getKornitxOrderStatusBaseUrl } from "../../shared/kornitx-outbound-urls";

function shippingStatusCode(
  orderShape: string,
  eventStatus: string,
): number {
  if (orderShape === "single") {
    return eventStatus === "dispatched" ? 8 : 128;
  }
  return eventStatus === "dispatched" ? 3 : 7;
}

function numericKornitxItemId(itemId: string): number {
  const numericItemId = Number(itemId);
  if (!Number.isFinite(numericItemId)) {
    throw new Error(`Invalid KornitX item ID ${itemId} for batched shipping`);
  }
  return numericItemId;
}

/**
 * Sends shipping status using the KornitX Shipping API shapes from the
 * Chinti & Parker Label Plus integration doc:
 * - single → PUT /order/:id/status with { status: 8 | 128 }
 * - batched → PUT /order-item/status with [{ id, data: { status: 3 | 7 } }]
 */
export async function sendShippingStatusesToKornitx(
  settings: AppSettings | null,
  order: KornitxOrder,
  events: ShippingStatusEvent[],
): Promise<void> {
  if (events.length === 0) return;

  if (order.orderShape === "single" && events.length !== 1) {
    throw new Error(
      `Single-item KornitX order ${order.kornitxId} expected one shipping event, got ${events.length}`,
    );
  }

  const { refId, apiKey } = loadKornitxApiCredentials(settings);
  const baseUrl = getKornitxOrderStatusBaseUrl();

  if (order.orderShape === "single") {
    const event = events[0];
    if (!event) return;

    const statusCode = shippingStatusCode("single", event.status);
    const response = await fetch(`${baseUrl}/order/${order.kornitxId}/status`, {
      method: "PUT",
      headers: {
        Authorization: kornitxBasicAuthHeader(refId, apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: statusCode }),
    });
    await parseKornitxHttpResponse(response, "shipping");
    return;
  }

  const body = events.map((event) => {
    const itemId = event.kornitxItemId;
    if (!itemId) {
      throw new Error(
        `Missing KornitX item ID for batched shipping event ${event.id}`,
      );
    }

    return {
      id: numericKornitxItemId(itemId),
      data: { status: shippingStatusCode("batched", event.status) },
    };
  });

  const response = await fetch(`${baseUrl}/order-item/status`, {
    method: "PUT",
    headers: {
      Authorization: kornitxBasicAuthHeader(refId, apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  await parseKornitxHttpResponse(response, "shipping");
}

/** @deprecated Use sendShippingStatusesToKornitx for batched sends. */
export async function sendShippingStatusToKornitx(
  settings: AppSettings | null,
  order: KornitxOrder,
  event: ShippingStatusEvent,
): Promise<void> {
  await sendShippingStatusesToKornitx(settings, order, [event]);
}
