-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN "lat" REAL;
ALTER TABLE "CustomerAddress" ADD COLUMN "lng" REAL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lat" REAL;
ALTER TABLE "Order" ADD COLUMN "lng" REAL;
