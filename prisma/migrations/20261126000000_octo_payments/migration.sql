-- Octo card payments: additive only (defaulted/nullable columns + a new table).
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "payMethod" TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE "Order" ADD COLUMN "payToken" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'octo',
    "shopTransactionId" TEXT NOT NULL,
    "octoPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "amountUzs" INTEGER NOT NULL,
    "payUrl" TEXT,
    "maskedPan" TEXT,
    "cardVendor" TEXT,
    "paidAt" DATETIME,
    "refundedUzs" INTEGER NOT NULL DEFAULT 0,
    "refundId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_payToken_key" ON "Order"("payToken");
CREATE UNIQUE INDEX "Payment_shopTransactionId_key" ON "Payment"("shopTransactionId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
