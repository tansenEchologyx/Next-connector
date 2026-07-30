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
  orderReceivedAt: Date;
  items: KornitxOrderItem[];
  shippingEvents: ShippingStatusEvent[];
  issues: KornitxOrderIssue[];
};

type FulfillmentJobInfo = {
  status: string;
  lastError: string | null;
} | null;

export function deriveFulfillmentStatus(
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

  const hasCancelled = events.some((event) => event.status === "cancelled");
  const dispatchedCount = events.filter(
    (event) => event.status === "dispatched",
  ).length;

  if (hasCancelled && dispatchedCount === 0) {
    return "cancelled";
  }

  if (order.orderShape === "batched") {
    const itemCount = order.items.length;
    if (dispatchedCount > 0 && dispatchedCount < itemCount) {
      return "partial";
    }
    if (hasCancelled && dispatchedCount > 0 && dispatchedCount < itemCount) {
      return "partial";
    }
  }

  if (dispatchedCount > 0) {
    return "fulfilled";
  }

  if (hasCancelled) {
    return "cancelled";
  }

  return "unfulfilled";
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

export function serializeOrderListRow(
  order: OrderWithRelations,
  fulfillmentJob: FulfillmentJobInfo,
): OrderListRow {
  const fulfillmentStatus = deriveFulfillmentStatus(order);
  const sendInfo = deriveSendFulfillmentStatus(
    order.shippingEvents,
    fulfillmentJob,
  );

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
    canResendFulfillment: sendInfo.canResend,
    activeIssues: order.issues
      .filter((issue) => issue.resolvedAt === null)
      .map((issue) => ({
        id: issue.id,
        type: issue.type,
        source: issue.source,
        message: issue.message,
        createdAt: issue.createdAt,
      })),
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
