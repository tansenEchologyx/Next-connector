-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "lastInventorySyncAt" TIMESTAMP(3);

-- Migrate legacy sync job status
UPDATE "SyncJob" SET "status" = 'processing' WHERE "status" = 'running';
