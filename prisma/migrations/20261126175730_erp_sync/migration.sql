-- AlterTable
ALTER TABLE "Variant" ADD COLUMN "erpLinkedAt" DATETIME;

-- CreateTable
CREATE TABLE "ErpOutbox" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ref" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" DATETIME,
    "lastError" TEXT,
    "erpDoc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpOutbox_ref_key" ON "ErpOutbox"("ref");

-- CreateIndex
CREATE INDEX "ErpOutbox_status_nextAttemptAt_idx" ON "ErpOutbox"("status", "nextAttemptAt");
