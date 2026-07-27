-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "kornitxRefId" TEXT NOT NULL DEFAULT '',
    "deltaIntervalMinutes" INTEGER NOT NULL DEFAULT 25,
    "inventoryLocationId" TEXT NOT NULL DEFAULT '',
    "b2bCustomerId" TEXT NOT NULL DEFAULT '',
    "defaultShippingAddress" JSONB NOT NULL DEFAULT '{}',
    "inboundAuthType" TEXT NOT NULL DEFAULT 'basic',
    "preemptiveOrderPrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedProduct" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySyncState" (
    "id" SERIAL NOT NULL,
    "trackedProductId" INTEGER NOT NULL,
    "pendingQuantity" INTEGER NOT NULL DEFAULT 0,
    "lastSentQuantity" INTEGER,
    "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),
    "needsSync" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InventorySyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KornitxOrder" (
    "id" SERIAL NOT NULL,
    "kornitxId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "dateTimeStamp" TIMESTAMP(3) NOT NULL,
    "orderShape" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "shopifyOrderId" TEXT,
    "orderReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KornitxOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KornitxOrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "promiseDate" TEXT NOT NULL,
    "orderExternalRef" TEXT NOT NULL,
    "shopifyLineItemId" TEXT,

    CONSTRAINT "KornitxOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingStatusEvent" (
    "id" SERIAL NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT,
    "kornitxOrderId" INTEGER NOT NULL,
    "kornitxItemId" TEXT,
    "status" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ShippingStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" SERIAL NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- CreateIndex
CREATE INDEX "TrackedProduct_shop_enabled_idx" ON "TrackedProduct"("shop", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedProduct_shop_variantId_key" ON "TrackedProduct"("shop", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySyncState_trackedProductId_key" ON "InventorySyncState"("trackedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "KornitxOrder_kornitxId_key" ON "KornitxOrder"("kornitxId");

-- CreateIndex
CREATE INDEX "KornitxOrder_status_idx" ON "KornitxOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KornitxOrderItem_orderId_itemId_key" ON "KornitxOrderItem"("orderId", "itemId");

-- CreateIndex
CREATE INDEX "ShippingStatusEvent_sent_eventAt_idx" ON "ShippingStatusEvent"("sent", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingStatusEvent_shopifyOrderId_shopifyLineItemId_status_key" ON "ShippingStatusEvent"("shopifyOrderId", "shopifyLineItemId", "status");

-- CreateIndex
CREATE INDEX "JobRun_jobName_startedAt_idx" ON "JobRun"("jobName", "startedAt");

-- AddForeignKey
ALTER TABLE "InventorySyncState" ADD CONSTRAINT "InventorySyncState_trackedProductId_fkey" FOREIGN KEY ("trackedProductId") REFERENCES "TrackedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KornitxOrderItem" ADD CONSTRAINT "KornitxOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "KornitxOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingStatusEvent" ADD CONSTRAINT "ShippingStatusEvent_kornitxOrderId_fkey" FOREIGN KEY ("kornitxOrderId") REFERENCES "KornitxOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
