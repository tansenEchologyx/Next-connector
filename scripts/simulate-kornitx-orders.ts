import "dotenv/config";

import { saveInboundOrders } from "../app/models/kornitx-inbound.server";
import { resolveDefaultShop } from "../app/models/shop.server";
import { parseKornitxOrderPayload } from "../app/services/order.parser";
import { prisma } from "../workers/lib/prisma";

const suffix = Date.now().toString().slice(-6);
/** Numeric ItemIDs match the KornitX multi-item shipping API (doc uses integer ids). */
const baseItemId = 280_000_000 + Number(suffix);

const payload = {
  Orders: [
    {
      ID: `SIM-SINGLE-${suffix}`,
      Brand: "Chinti & Parker Ltd",
      Destination: "NextRDC",
      DateTimeStamp: new Date().toISOString(),
      Currency: "GBP",
      OrderExternalRef: `EXT-SINGLE-${suffix}`,
      Items: [
        {
          ItemID: baseItemId + 1,
          EAN: "1234567890123",
          Quantity: 1,
          PromiseDate: "2026-07-30",
        },
      ],
    },
    {
      ID: `SIM-BATCH-A-${suffix}`,
      Brand: "Chinti & Parker Ltd",
      Destination: "NextRDC",
      DateTimeStamp: new Date().toISOString(),
      Currency: "GBP",
      Items: [
        {
          ItemID: baseItemId + 2,
          EAN: "1234567890123",
          Quantity: 1,
          PromiseDate: "2026-07-30",
          OrderExternalRef: `EXT-BA1-${suffix}`,
        },
        {
          ItemID: baseItemId + 3,
          EAN: "1234567890124",
          Quantity: 1,
          PromiseDate: "2026-07-31",
          OrderExternalRef: `EXT-BA2-${suffix}`,
        },
      ],
    },
    {
      ID: `SIM-BATCH-B-${suffix}`,
      Brand: "Chinti & Parker Ltd",
      Destination: "NextRDC",
      DateTimeStamp: new Date().toISOString(),
      Currency: "GBP",
      Items: [
        {
          ItemID: baseItemId + 4,
          EAN: "1234567890125",
          Quantity: 1,
          PromiseDate: "2026-08-01",
          OrderExternalRef: `EXT-BB1-${suffix}`,
        },
        {
          ItemID: baseItemId + 5,
          EAN: "1234567890126",
          Quantity: 1,
          PromiseDate: "2026-08-02",
          OrderExternalRef: `EXT-BB2-${suffix}`,
        },
      ],
    },
  ],
};

async function main() {
  const shop = await resolveDefaultShop();
  const orders = parseKornitxOrderPayload(payload);
  const saved = await saveInboundOrders(shop, orders);

  console.log(`Simulated ${saved.length} KornitX order(s) for ${shop}:`);
  for (const order of saved) {
    const itemCount = await prisma.kornitxOrderItem.count({
      where: { orderId: order.id },
    });
    console.log(
      `- ${order.kornitxId} (${order.orderShape}, ${itemCount} item(s), status=${order.status})`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
