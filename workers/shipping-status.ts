import { loadEnv } from "./lib/load-env";
import { disconnectPrisma, prisma } from "./lib/prisma";
import { completeJobRun, failJobRun, startJobRun } from "./lib/job-run";

const MINUTES_20_MS = 20 * 60 * 1000;

loadEnv();

async function main() {
  const jobRun = await startJobRun("shipping-status");
  const cutoff = new Date(Date.now() - MINUTES_20_MS);

  try {
    const events = await prisma.shippingStatusEvent.findMany({
      where: {
        sent: false,
        order: {
          orderReceivedAt: { lte: cutoff },
        },
      },
      include: { order: true },
    });

    if (events.length === 0) {
      console.log("[shipping-status] No due events (or 20-min rule not met).");
      await completeJobRun(jobRun.id, { sent: 0 });
      return;
    }

    // TODO: PUT dispatch/cancel to KornitX (single vs batched API per orderShape)
    console.log(
      `[shipping-status] Would send ${events.length} status update(s):`,
      events.map((e) => ({
        kornitxId: e.order.kornitxId,
        status: e.status,
        shape: e.order.orderShape,
      })),
    );

    const now = new Date();
    await prisma.shippingStatusEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { sent: true, sentAt: now },
    });

    await completeJobRun(jobRun.id, { sent: events.length });
    console.log(
      `[shipping-status] Marked ${events.length} event(s) sent (KornitX PUT pending).`,
    );
  } catch (err) {
    await failJobRun(jobRun.id, err);
    throw err;
  } finally {
    await disconnectPrisma();
  }
}

main().catch((err) => {
  console.error("[shipping-status] Fatal error:", err);
  process.exit(1);
});
