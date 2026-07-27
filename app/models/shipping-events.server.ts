import prisma from "../db.server";

type CreateShippingEventInput = {
  shopifyOrderId: string;
  shopifyLineItemId: string | null;
  kornitxOrderId: number;
  kornitxItemId: string | null;
  status: "dispatched" | "cancelled";
};

export async function createShippingStatusEvent(
  input: CreateShippingEventInput,
) {
  const existing = await prisma.shippingStatusEvent.findFirst({
    where: {
      shopifyOrderId: input.shopifyOrderId,
      shopifyLineItemId: input.shopifyLineItemId,
      status: input.status,
    },
  });

  if (existing) {
    return { event: existing, created: false as const };
  }

  const event = await prisma.shippingStatusEvent.create({
    data: {
      shopifyOrderId: input.shopifyOrderId,
      shopifyLineItemId: input.shopifyLineItemId,
      kornitxOrderId: input.kornitxOrderId,
      kornitxItemId: input.kornitxItemId,
      status: input.status,
    },
  });

  return { event, created: true as const };
}
