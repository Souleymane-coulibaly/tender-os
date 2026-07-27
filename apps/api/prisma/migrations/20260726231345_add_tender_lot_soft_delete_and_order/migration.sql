-- AlterTable
ALTER TABLE "tender_lots" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "tender_lots_organization_id_tender_id_display_order_idx" ON "tender_lots"("organization_id", "tender_id", "display_order");
