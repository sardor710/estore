-- AlterTable
ALTER TABLE "CustomerMessage" ADD COLUMN "mediaKind" TEXT;
ALTER TABLE "CustomerMessage" ADD COLUMN "mediaUrl" TEXT;

-- AlterTable
ALTER TABLE "MessageBroadcast" ADD COLUMN "mediaKind" TEXT;
ALTER TABLE "MessageBroadcast" ADD COLUMN "mediaUrl" TEXT;
