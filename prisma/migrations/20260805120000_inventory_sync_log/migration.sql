-- CreateTable
CREATE TABLE "InventorySyncRun" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eansAttempted" INTEGER NOT NULL DEFAULT 0,
    "eansMarkedSent" INTEGER NOT NULL DEFAULT 0,
    "skippedRace" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "syncJobId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "InventorySyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySyncIssue" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "InventorySyncIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventorySyncRun_shop_startedAt_idx" ON "InventorySyncRun"("shop", "startedAt");

-- CreateIndex
CREATE INDEX "InventorySyncRun_shop_syncType_status_idx" ON "InventorySyncRun"("shop", "syncType", "status");

-- CreateIndex
CREATE INDEX "InventorySyncIssue_shop_resolvedAt_idx" ON "InventorySyncIssue"("shop", "resolvedAt");

-- CreateIndex
CREATE INDEX "InventorySyncIssue_shop_syncType_resolvedAt_idx" ON "InventorySyncIssue"("shop", "syncType", "resolvedAt");
