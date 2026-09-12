-- AlterTable
ALTER TABLE "Product" ADD COLUMN "ean" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_ean_key" ON "Product"("ean");
