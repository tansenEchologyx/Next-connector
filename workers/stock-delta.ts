import { loadEnv } from "./lib/load-env";
import { disconnectPrisma, prisma } from "./lib/prisma";
import { completeJobRun, failJobRun, startJobRun } from "./lib/job-run";

const MAX_EANS_PER_BATCH = 100;

loadEnv();

async function main() {
  const jobRun = await startJobRun("stock-delta");

  try {
    const pending = await prisma.inventorySyncState.findMany({
      where: { needsSync: true },
      include: { trackedProduct: true },
      take: MAX_EANS_PER_BATCH,
    });

    if (pending.length === 0) {
      console.log("[stock-delta] No inventory changes to sync.");
      await completeJobRun(jobRun.id, { synced: 0 });
      return;
    }

    // TODO: PUT absolute quantities to KornitX stock API
    console.log(
      `[stock-delta] Would sync ${pending.length} EAN(s):`,
      pending.map((p) => ({
        ean: p.trackedProduct.ean,
        qty: p.pendingQuantity,
      })),
    );

    const now = new Date();
    for (const row of pending) {
      await prisma.inventorySyncState.update({
        where: { id: row.id },
        data: {
          lastSentQuantity: row.pendingQuantity,
          lastSentAt: now,
          needsSync: false,
        },
      });
    }

    await completeJobRun(jobRun.id, { synced: pending.length });
    console.log(
      `[stock-delta] Marked ${pending.length} row(s) as synced (KornitX PUT pending).`,
    );
  } catch (err) {
    await failJobRun(jobRun.id, err);
    throw err;
  } finally {
    await disconnectPrisma();
  }
}

main().catch((err) => {
  console.error("[stock-delta] Fatal error:", err);
  process.exit(1);
});
