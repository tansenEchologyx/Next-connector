import prisma from "../db.server";

export const ISSUE_TYPES = {
  ERROR: "error",
  WARNING: "warning",
} as const;

export const ISSUE_SOURCES = {
  ORDER_PROCESSING: "order_processing",
  FULFILLMENT_SEND: "fulfillment_send",
} as const;

export async function createOrderIssue(
  orderId: number,
  type: string,
  source: string,
  message: string,
) {
  await resolveOrderIssuesBySource(orderId, source);

  return prisma.kornitxOrderIssue.create({
    data: {
      orderId,
      type,
      source,
      message,
    },
  });
}

export async function upsertOpenOrderIssue(
  orderId: number,
  type: string,
  source: string,
  message: string,
) {
  const existing = await prisma.kornitxOrderIssue.findFirst({
    where: { orderId, source, resolvedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    if (existing.message === message && existing.type === type) {
      return existing;
    }

    return prisma.kornitxOrderIssue.update({
      where: { id: existing.id },
      data: { type, message },
    });
  }

  return prisma.kornitxOrderIssue.create({
    data: { orderId, type, source, message },
  });
}

export async function resolveOrderIssuesBySource(
  orderId: number,
  source: string,
) {
  const now = new Date();
  await prisma.kornitxOrderIssue.updateMany({
    where: { orderId, source, resolvedAt: null },
    data: { resolvedAt: now },
  });
}

export async function resolveAllOrderIssues(orderId: number) {
  const now = new Date();
  await prisma.kornitxOrderIssue.updateMany({
    where: { orderId, resolvedAt: null },
    data: { resolvedAt: now },
  });
}
