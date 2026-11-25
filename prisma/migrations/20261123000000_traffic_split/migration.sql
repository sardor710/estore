-- Traffic split: additive, nullable columns only.
-- AlterTable
ALTER TABLE "PageView" ADD COLUMN "signedIn" BOOLEAN;
ALTER TABLE "PageView" ADD COLUMN "region" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "lastLoginAt" DATETIME;
ALTER TABLE "Customer" ADD COLUMN "lastSeenAt" DATETIME;
