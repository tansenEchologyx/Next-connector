import { loadEnv } from "./lib/load-env";
import { disconnectPrisma, prisma } from "./lib/prisma";
import { completeJobRun, failJobRun, startJobRun } from "./lib/job-run";

const MAX_EANS_PER_BATCH = 100;

loadEnv();

async function main() {
  const jobRun = await startJobRun("stock-full-feed");

  try {
    const tracked = await prisma.trackedProduct.findMany({
      where: { enabled: true },
      include: { inventorySyncState: true },
    });

    if (tracked.length === 0) {
      console.log("[stock-full-feed] No tracked products enabled.");
      await completeJobRun(jobRun.id, { sent: 0 });
      return;
    }

    const batches = Math.ceil(tracked.length / MAX_EANS_PER_BATCH);
    console.log(
      `[stock-full-feed] Would send full feed for ${tracked.length} product(s) in ${batches} batch(es). KornitX PUT pending.`,
    );

    // TODO: read live inventory from Shopify, PUT all EANs to KornitX
    const now = new Date();
    for (const product of tracked) {
      const qty = product.inventorySyncState?.pendingQuantity ?? 0;
      await prisma.inventorySyncState.upsert({
        where: { trackedProductId: product.id },
        create: {
          trackedProductId: product.id,
          pendingQuantity: qty,
          lastSentQuantity: qty,
          lastSentAt: now,
          lastChangedAt: now,
          needsSync: false,
        },
        update: {
          lastSentQuantity: qty,
          lastSentAt: now,
          needsSync: false,
        },
      });
    }

    await completeJobRun(jobRun.id, {
      products: tracked.length,
      batches,
    });
    console.log(
      `[stock-full-feed] Baseline updated for ${tracked.length} product(s).`,
    );
  } catch (err) {
    await failJobRun(jobRun.id, err);
    throw err;
  } finally {
    await disconnectPrisma();
  }
}

main().catch((err) => {
  console.error("[stock-full-feed] Fatal error:", err);
  process.exit(1);
});
