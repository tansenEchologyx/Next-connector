-- AlterTable
ALTER TABLE "KornitxOrder" ADD COLUMN "sendFulfillmentStatus" TEXT NOT NULL DEFAULT 'none';

-- Backfill: has shipping events and none unsent → sent
UPDATE "KornitxOrder" AS o
SET "sendFulfillmentStatus" = 'sent'
WHERE EXISTS (
  SELECT 1 FROM "ShippingStatusEvent" e WHERE e."kornitxOrderId" = o.id
)
AND NOT EXISTS (
  SELECT 1
  FROM "ShippingStatusEvent" e
  WHERE e."kornitxOrderId" = o.id AND e.sent = false
);

-- Backfill: has unsent events → unsent
UPDATE "KornitxOrder" AS o
SET "sendFulfillmentStatus" = 'unsent'
WHERE EXISTS (
  SELECT 1
  FROM "ShippingStatusEvent" e
  WHERE e."kornitxOrderId" = o.id AND e.sent = false
);

-- Backfill: unsent events + terminal failed send_fulfillment SyncJob → failed
UPDATE "KornitxOrder" AS o
SET "sendFulfillmentStatus" = 'failed'
WHERE EXISTS (
  SELECT 1
  FROM "ShippingStatusEvent" e
  WHERE e."kornitxOrderId" = o.id AND e.sent = false
)
AND EXISTS (
  SELECT 1
  FROM "SyncJob" j
  WHERE j."idempotencyKey" = 'send_fulfillment:order:' || o."kornitxId"
    AND j.status = 'failed'
);

-- CreateIndex
CREATE INDEX "KornitxOrder_sendFulfillmentStatus_idx" ON "KornitxOrder"("sendFulfillmentStatus");
