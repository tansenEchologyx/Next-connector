-- CreateTable
CREATE TABLE "EventLog" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "kornitxOrderId" TEXT,
    "shopifyOrderId" TEXT,
    "shopifyOrderName" TEXT,
    "syncJobId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventLog_shop_createdAt_id_idx" ON "EventLog"("shop", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "EventLog_shop_level_createdAt_idx" ON "EventLog"("shop", "level", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EventLog_shop_category_createdAt_idx" ON "EventLog"("shop", "category", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EventLog_shop_shopifyOrderName_idx" ON "EventLog"("shop", "shopifyOrderName");

-- CreateIndex
CREATE INDEX "EventLog_shop_kornitxOrderId_idx" ON "EventLog"("shop", "kornitxOrderId");
