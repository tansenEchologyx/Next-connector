-- AlterTable
ALTER TABLE "KornitxOrder" ADD COLUMN "shopifyOrderName" TEXT;

-- CreateIndex
CREATE INDEX "KornitxOrder_orderReceivedAt_idx" ON "KornitxOrder"("orderReceivedAt");

-- CreateTable
CREATE TABLE "KornitxOrderIssue" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "KornitxOrderIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KornitxOrderIssue_orderId_resolvedAt_idx" ON "KornitxOrderIssue"("orderId", "resolvedAt");

-- CreateIndex
CREATE INDEX "KornitxOrderIssue_orderId_source_resolvedAt_idx" ON "KornitxOrderIssue"("orderId", "source", "resolvedAt");

-- AddForeignKey
ALTER TABLE "KornitxOrderIssue" ADD CONSTRAINT "KornitxOrderIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "KornitxOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill error issues from existing failureReason rows
INSERT INTO "KornitxOrderIssue" ("orderId", "type", "source", "message", "createdAt")
SELECT id, 'error', 'order_processing', "failureReason", COALESCE("updatedAt", "createdAt")
FROM "KornitxOrder"
WHERE "failureReason" IS NOT NULL AND "failureReason" <> '';
