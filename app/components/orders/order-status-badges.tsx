import type {
  FulfillmentStatus,
  SendFulfillmentStatus,
} from "../../../shared/order-display";
import {
  FULFILLMENT_STATUS_LABELS,
  SEND_FULFILLMENT_STATUS_LABELS,
} from "../../../shared/order-display";
import { formatUkDateTime } from "../../../shared/uk-time";

export function creationStatusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case "created":
      return "success";
    case "failed":
      return "critical";
    case "processing":
      return "warning";
    default:
      return "info";
  }
}

export function fulfillmentStatusTone(
  status: FulfillmentStatus,
): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case "fulfilled":
      return "success";
    case "partial":
      return "warning";
    case "cancelled":
      return "critical";
    case "unfulfilled":
      return "info";
    default:
      return "info";
  }
}

export function sendFulfillmentStatusTone(
  status: SendFulfillmentStatus,
): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case "sent":
      return "success";
    case "failed":
      return "critical";
    case "unsent":
      return "warning";
    default:
      return "info";
  }
}

export function formatCreationStatus(status: string): string {
  return status.toUpperCase();
}

export function formatFulfillmentStatus(status: FulfillmentStatus): string {
  return FULFILLMENT_STATUS_LABELS[status];
}

export function formatSendFulfillmentStatus(
  status: SendFulfillmentStatus,
): string {
  return SEND_FULFILLMENT_STATUS_LABELS[status];
}

export function formatOrderDate(value: Date | string): string {
  return formatUkDateTime(value);
}

export function issueTypeLabel(type: string): string {
  return type.toUpperCase();
}

export function issueTypeTone(
  type: string,
): "critical" | "warning" | "info" {
  return type === "error" ? "critical" : type === "warning" ? "warning" : "info";
}
