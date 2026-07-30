-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "dailyFullFeedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "dailyFullFeedTime" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "lastDailyFullFeedAt" TIMESTAMP(3);
