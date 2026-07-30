import type { Prisma } from "@prisma/client";

import prisma from "../db.server";
import {
  ISSUE_SOURCES,
  resolveOrderIssuesBySource,
} from "./kornitx-order-issues.server";
import {
  enqueueProcessOrderJob,
  enqueueSendFulfillmentJobIfNeeded,
} from "./sync-jobs.server";
import {
  deriveFulfillmentStatus,
  deriveSendFulfillmentStatus,
  serializeOrderListRow,
} from "../../shared/order-display";
import { SYNC_JOB_TYPES } from "../../shared/sync-job-types";

export type OrderListFilters = {
  page: number;
  pageSize: number;
  q: string;
  status: string;
  shape: string;
  fulfillment: string;
  sendFulfillment: string;
  sort: "newest" | "oldest";
};

function sendFulfillmentKey(kornitxId: string): string {
  return `${SYNC_JOB_TYPES.SEND_FULFILLMENT}:order:${kornitxId}`;
}

function buildWhere(filters: OrderListFilters): Prisma.KornitxOrderWhereInput {
  const where: Prisma.KornitxOrderWhereInput = {};

  if (filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.shape !== "all") {
    where.orderShape = filters.shape;
  }

  if (filters.q.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { kornitxId: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { shopifyOrderName: { contains: q, mode: "insensitive" } },
      { shopifyOrderId: { contains: q, mode: "insensitive" } },
    ];
  }

  switch (filters.fulfillment) {
    case "pending":
      where.status = { not: "created" };
      break;
    case "unfulfilled":
      where.status = "created";
      where.shippingEvents = { none: {} };
      break;
    case "fulfilled":
      where.shippingEvents = { some: { status: "dispatched" } };
      break;
    case "cancelled":
      where.shippingEvents = {
        some: { status: "cancelled" },
        none: { status: "dispatched" },
      };
      break;
    case "partial":
      where.orderShape = "batched";
      where.shippingEvents = { some: { status: "dispatched" } };
      break;
  }

  switch (filters.sendFulfillment) {
    case "none":
      where.shippingEvents = { none: {} };
      break;
    case "unsent":
      where.shippingEvents = { some: { sent: false } };
      break;
    case "sent":
      where.shippingEvents = { some: {} };
      where.NOT = { shippingEvents: { some: { sent: false } } };
      break;
    case "failed":
      where.shippingEvents = { some: { sent: false } };
      break;
  }

  return where;
}

async function fetchFulfillmentJobs(kornitxIds: string[]) {
  if (kornitxIds.length === 0) {
    return new Map<string, { status: string; lastError: string | null }>();
  }

  const keys = kornitxIds.map(sendFulfillmentKey);
  const jobs = await prisma.syncJob.findMany({
    where: { idempotencyKey: { in: keys } },
    select: { idempotencyKey: true, status: true, lastError: true },
  });

  const map = new Map<string, { status: string; lastError: string | null }>();
  for (const job of jobs) {
    const kornitxId = job.idempotencyKey.replace(
      `${SYNC_JOB_TYPES.SEND_FULFILLMENT}:order:`,
      "",
    );
    map.set(kornitxId, { status: job.status, lastError: job.lastError });
  }
  return map;
}

const orderInclude = {
  items: true,
  shippingEvents: true,
  issues: {
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" as const },
  },
};

function needsInMemoryFilter(filters: OrderListFilters): boolean {
  return filters.fulfillment === "partial" || filters.sendFulfillment === "failed";
}

function matchesInMemoryFilters(
  order: {
    orderShape: string;
    status: string;
    items: { length: number };
    shippingEvents: Array<{ status: string; sent: boolean }>;
    kornitxId: string;
  },
  filters: OrderListFilters,
  fulfillmentJobs: Map<string, { status: string; lastError: string | null }>,
): boolean {
  if (filters.fulfillment === "partial") {
    const fulfillmentStatus = deriveFulfillmentStatus({
      status: order.status,
      orderShape: order.orderShape,
      items: order.items as never,
      shippingEvents: order.shippingEvents as never,
    });
    if (fulfillmentStatus !== "partial") return false;
  }

  if (filters.sendFulfillment === "failed") {
    const sendInfo = deriveSendFulfillmentStatus(
      order.shippingEvents as never,
      fulfillmentJobs.get(order.kornitxId) ?? null,
    );
    if (sendInfo.status !== "failed") return false;
  }

  return true;
}

export async function listOrders(filters: OrderListFilters) {
  const where = buildWhere(filters);
  const orderBy = {
    orderReceivedAt: filters.sort === "oldest" ? "asc" : "desc",
  } as const;

  if (needsInMemoryFilter(filters)) {
    const candidates = await prisma.kornitxOrder.findMany({
      where,
      orderBy,
      include: orderInclude,
    });

    const fulfillmentJobs = await fetchFulfillmentJobs(
      candidates.map((order) => order.kornitxId),
    );

    const filtered = candidates.filter((order) =>
      matchesInMemoryFilters(order, filters, fulfillmentJobs),
    );

    const totalCount = filtered.length;
    const skip = (filters.page - 1) * filters.pageSize;
    const pageOrders = filtered.slice(skip, skip + filters.pageSize);

    return {
      orders: pageOrders.map((order) =>
        serializeOrderListRow(
          order,
          fulfillmentJobs.get(order.kornitxId) ?? null,
        ),
      ),
      totalCount,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
      filters,
    };
  }

  const skip = (filters.page - 1) * filters.pageSize;
  const [orders, totalCount] = await Promise.all([
    prisma.kornitxOrder.findMany({
      where,
      orderBy,
      skip,
      take: filters.pageSize,
      include: orderInclude,
    }),
    prisma.kornitxOrder.count({ where }),
  ]);

  const fulfillmentJobs = await fetchFulfillmentJobs(
    orders.map((order) => order.kornitxId),
  );

  return {
    orders: orders.map((order) =>
      serializeOrderListRow(order, fulfillmentJobs.get(order.kornitxId) ?? null),
    ),
    totalCount,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
    filters,
  };
}

export async function retryFailedOrder(shop: string, orderId: number) {
  const order = await prisma.kornitxOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "failed") {
    throw new Error("Only failed orders can be retried");
  }

  const updated = await prisma.kornitxOrder.update({
    where: { id: orderId },
    data: { status: "received", failureReason: null },
  });

  await resolveOrderIssuesBySource(orderId, ISSUE_SOURCES.ORDER_PROCESSING);
  await enqueueProcessOrderJob(shop, updated.id, updated.kornitxId);

  return updated;
}

export async function resendFulfillmentForOrder(shop: string, orderId: number) {
  const order = await prisma.kornitxOrder.findUnique({
    where: { id: orderId },
    include: { shippingEvents: true },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const hasUnsent = order.shippingEvents.some((event) => !event.sent);
  if (!hasUnsent) {
    throw new Error("No unsent fulfillment statuses for this order");
  }

  await enqueueSendFulfillmentJobIfNeeded(
    shop,
    order.id,
    order.kornitxId,
    order.orderReceivedAt,
    { forceReset: true },
  );

  return order;
}

export async function getOrderStatusCounts() {
  const groups = await prisma.kornitxOrder.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  return Object.fromEntries(
    groups.map((group) => [group.status, group._count.status]),
  ) as Record<string, number>;
}

export function parseOrderListFilters(
  searchParams: URLSearchParams,
): OrderListFilters {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const rawPageSize = Number(searchParams.get("pageSize") ?? "10");
  const pageSize = [10, 25, 50].includes(rawPageSize) ? rawPageSize : 10;

  return {
    page,
    pageSize,
    q: searchParams.get("q") ?? "",
    status: searchParams.get("status") ?? "all",
    shape: searchParams.get("shape") ?? "all",
    fulfillment: searchParams.get("fulfillment") ?? "all",
    sendFulfillment: searchParams.get("sendFulfillment") ?? "all",
    sort: searchParams.get("sort") === "oldest" ? "oldest" : "newest",
  };
}
