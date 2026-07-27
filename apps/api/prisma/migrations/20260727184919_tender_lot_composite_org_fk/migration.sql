-- DropForeignKey
ALTER TABLE "tender_lots" DROP CONSTRAINT "tender_lots_tender_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "tenders_id_organization_id_key" ON "tenders"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "tender_lots" ADD CONSTRAINT "tender_lots_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
