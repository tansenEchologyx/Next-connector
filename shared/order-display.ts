import type {
  KornitxOrderIssue,
  KornitxOrderItem,
  ShippingStatusEvent,
} from "@prisma/client";

export type FulfillmentStatus =
  | "pending"
  | "unfulfilled"
  | "fulfilled"
  | "partial"
  | "cancelled";

export type SendFulfillmentStatus =
  | "none"
  | "unsent"
  | "sent"
  | "failed";

export type OrderListRow = {
  id: number;
  kornitxId: string;
  brand: string;
  orderShape: string;
  status: string;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  orderReceivedAt: Date;
  itemCount: number;
  fulfillmentStatus: FulfillmentStatus;
  sendFulfillmentStatus: SendFulfillmentStatus;
  sendFulfillmentError: string | null;
  /** True when Shopify order creation failed (auto-retry pending or exhausted). */
  canRetryOrderCreation: boolean;
  canResendFulfillment: boolean;
  activeIssues: Array<{
    id: number;
    type: string;
    source: string;
    message: string;
    createdAt: Date;
  }>;
};

type OrderWithRelations = {
  id: number;
  kornitxId: string;
  brand: string;
  orderShape: string;
  status: string;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  shopifyFulfillmentStatus: string | null;
  orderReceivedAt: Date;
  items: KornitxOrderItem[];
  shippingEvents: ShippingStatusEvent[];
  issues: KornitxOrderIssue[];
};

type FulfillmentJobInfo = {
  status: string;
  lastError: string | null;
} | null;

/**
 * Prefer Shopify's fulfillment status (stored from webhooks) for the Orders list.
 * Falls back to deriving from shipping events only when Shopify status is unset.
 */
export function resolveFulfillmentStatus(
  order: Pick<
    OrderWithRelations,
    "status" | "orderShape" | "items" | "shopifyFulfillmentStatus"
  > & {
    shippingEvents: ShippingStatusEvent[];
  },
): FulfillmentStatus {
  if (order.status !== "created") {
    return "pending";
  }

  const stored = order.shopifyFulfillmentStatus;
  if (stored === "cancelled") return "cancelled";
  if (stored === "fulfilled") return "fulfilled";
  if (stored === "partial") return "partial";
  if (stored === "unfulfilled") return "unfulfilled";

  return deriveFulfillmentStatusFromEvents(order);
}

/** Legacy fallback when shopifyFulfillmentStatus has not been set yet. */
export function deriveFulfillmentStatusFromEvents(
  order: Pick<OrderWithRelations, "status" | "orderShape" | "items"> & {
    shippingEvents: ShippingStatusEvent[];
  },
): FulfillmentStatus {
  if (order.status !== "created") {
    return "pending";
  }

  const events = order.shippingEvents;
  if (events.length === 0) {
    return "unfulfilled";
  }

  const cancelledCount = events.filter(
    (event) => event.status === "cancelled",
  ).length;
  const dispatchedCount = events.filter(
    (event) => event.status === "dispatched",
  ).length;
  const itemCount = order.items.length;
  const terminalCount = cancelledCount + dispatchedCount;

  if (order.orderShape === "batched" && itemCount > 0) {
    if (terminalCount > 0 && terminalCount < itemCount) {
      return "partial";
    }
    if (dispatchedCount === itemCount) {
      return "fulfilled";
    }
    if (cancelledCount === itemCount) {
      return "cancelled";
    }
    if (dispatchedCount > 0 && cancelledCount > 0) {
      return "partial";
    }
  }

  if (dispatchedCount > 0 && cancelledCount === 0) {
    return "fulfilled";
  }

  if (cancelledCount > 0 && dispatchedCount === 0) {
    return "cancelled";
  }

  if (dispatchedCount > 0 && cancelledCount > 0) {
    return "partial";
  }

  return "unfulfilled";
}

/** @deprecated Use resolveFulfillmentStatus */
export function deriveFulfillmentStatus(
  order: Pick<OrderWithRelations, "status" | "orderShape" | "items"> & {
    shippingEvents: ShippingStatusEvent[];
    shopifyFulfillmentStatus?: string | null;
  },
): FulfillmentStatus {
  return resolveFulfillmentStatus({
    ...order,
    shopifyFulfillmentStatus: order.shopifyFulfillmentStatus ?? null,
  });
}

export function deriveSendFulfillmentStatus(
  shippingEvents: ShippingStatusEvent[],
  fulfillmentJob: FulfillmentJobInfo,
): {
  status: SendFulfillmentStatus;
  error: string | null;
  canResend: boolean;
} {
  if (shippingEvents.length === 0) {
    return { status: "none", error: null, canResend: false };
  }

  const unsentCount = shippingEvents.filter((event) => !event.sent).length;
  if (unsentCount === 0) {
    return { status: "sent", error: null, canResend: false };
  }

  const jobFailed = fulfillmentJob?.status === "failed";
  const jobError = fulfillmentJob?.lastError ?? null;

  if (jobFailed) {
    return {
      status: "failed",
      error: jobError,
      canResend: true,
    };
  }

  return {
    status: "unsent",
    error: jobError,
    canResend: true,
  };
}

export function formatShopifyOrderLabel(
  shopifyOrderName: string | null,
  shopifyOrderId: string | null,
): string {
  if (shopifyOrderName) return shopifyOrderName;
  if (!shopifyOrderId) return "—";
  const match = shopifyOrderId.match(/(\d+)$/);
  return match ? `#${match[1]}` : shopifyOrderId;
}

const ORDER_PROCESSING_SOURCE = "order_processing";

export function canRetryOrderCreation(order: {
  status: string;
  issues: Array<{ resolvedAt: Date | null; source: string }>;
}): boolean {
  if (order.status === "created") return false;
  if (order.status === "failed") return true;

  return order.issues.some(
    (issue) =>
      issue.resolvedAt === null && issue.source === ORDER_PROCESSING_SOURCE,
  );
}

export function serializeOrderListRow(
  order: OrderWithRelations,
  fulfillmentJob: FulfillmentJobInfo,
): OrderListRow {
  const fulfillmentStatus = resolveFulfillmentStatus(order);
  const sendInfo = deriveSendFulfillmentStatus(
    order.shippingEvents,
    fulfillmentJob,
  );
  const activeIssues = order.issues
    .filter((issue) => issue.resolvedAt === null)
    .map((issue) => ({
      id: issue.id,
      type: issue.type,
      source: issue.source,
      message: issue.message,
      createdAt: issue.createdAt,
    }));

  return {
    id: order.id,
    kornitxId: order.kornitxId,
    brand: order.brand,
    orderShape: order.orderShape,
    status: order.status,
    shopifyOrderId: order.shopifyOrderId,
    shopifyOrderName: order.shopifyOrderName,
    orderReceivedAt: order.orderReceivedAt,
    itemCount: order.items.length,
    fulfillmentStatus,
    sendFulfillmentStatus: sendInfo.status,
    sendFulfillmentError: sendInfo.error,
    canRetryOrderCreation: canRetryOrderCreation(order),
    canResendFulfillment: sendInfo.canResend,
    activeIssues,
  };
}

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending: "PENDING",
  unfulfilled: "UNFULFILLED",
  fulfilled: "FULFILLED",
  partial: "PARTIAL",
  cancelled: "CANCELLED",
};

export const SEND_FULFILLMENT_STATUS_LABELS: Record<
  SendFulfillmentStatus,
  string
> = {
  none: "—",
  unsent: "UNSENT",
  sent: "SENT",
  failed: "FAILED",
};
