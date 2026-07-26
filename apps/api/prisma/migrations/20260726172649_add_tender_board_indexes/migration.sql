-- CreateIndex
CREATE INDEX "tenders_organization_id_internal_owner_id_idx" ON "tenders"("organization_id", "internal_owner_id");

-- CreateIndex
CREATE INDEX "tenders_organization_id_updated_at_idx" ON "tenders"("organization_id", "updated_at");
