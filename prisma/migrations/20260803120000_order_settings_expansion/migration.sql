-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "useCustomerShippingAddress" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "requirePreemptivePrefix" BOOLEAN NOT NULL DEFAULT false;
