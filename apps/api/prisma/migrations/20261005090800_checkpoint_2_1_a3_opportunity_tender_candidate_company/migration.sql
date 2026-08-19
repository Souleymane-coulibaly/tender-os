-- TenderOS 2.1 — Checkpoint 2.1-A3 (Opportunity/Tender → CandidateCompany)
-- Établit la relation métier canonique "quelle entreprise juridique répond" au niveau Opportunity et
-- Tender, distincte de `clientAccountId` (contexte client/portefeuille legacy, non touché). Strictement
-- additive : deux colonnes nullables + deux FK + deux index, aucune donnée existante modifiée,
-- aucun NOT NULL, aucun backfill (voir le rapport de mission — aucun mapping déterministe validé
-- pour Opportunity/Tender → CandidateCompany, contrairement au backfill ClientAccount → CandidateCompany
-- de A2).

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN "candidate_company_id" UUID;

-- AlterTable
ALTER TABLE "tenders" ADD COLUMN "candidate_company_id" UUID;

-- CreateIndex
CREATE INDEX "opportunities_organization_id_candidate_company_id_idx" ON "opportunities"("organization_id", "candidate_company_id");

-- CreateIndex
CREATE INDEX "tenders_organization_id_candidate_company_id_idx" ON "tenders"("organization_id", "candidate_company_id");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_candidate_company_id_organization_id_fkey" FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_candidate_company_id_organization_id_fkey" FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE SET NULL ON UPDATE CASCADE;
