-- TENDEROS-2.1-P2.2-E1-CANDIDATE-PRICING
-- Migration additive : jamais une ancienne migration modifiée.
--
-- `pricing_schedules.client_account_id` conflait jusqu'ici le client commercial (ClientAccount)
-- avec l'entreprise candidate qui répond réellement à l'appel d'offres (CandidateCompany) — un
-- chiffrage final soumis à l'acheteur doit appartenir au candidat, jamais au client commercial.
-- `client_account_id` est CONSERVÉ (RBAC/scoping client, fonction légitime distincte) ; cette
-- colonne additive nullable porte désormais la provenance candidate réelle, même motif que
-- `response_package_versions.candidate_company_id` (Checkpoint 2.1-P2.1-FIX-E) : NULL pour tout
-- chiffrage écrit avant ce checkpoint (provenance inconnue, jamais devinée) ou pour un Tender sans
-- candidate résolue.

-- AlterTable
ALTER TABLE "pricing_schedules" ADD COLUMN "candidate_company_id" UUID;

-- CreateIndex
CREATE INDEX "pricing_schedules_organization_id_candidate_company_id_idx" ON "pricing_schedules"("organization_id", "candidate_company_id");

-- Les DEUX index partiels uniques de la migration Sprint 13 (20260919090000) appliquaient "un seul
-- chiffrage par (Tender, lot, CANDIDATE, fichier source)" via `client_account_id` — la même colonne
-- pour TOUTES les candidates d'un Tender (un Tender a un seul ClientAccount), donc jamais réellement
-- discriminante entre deux candidates réelles (root cause du P1, confirmé par un test réel :
-- `TEST 12 — multi-candidate` échouait en violation de contrainte AVANT ce correctif). Remplacés
-- ci-dessous par `candidate_company_id`, avec le MÊME motif partiel-index-par-nullabilité que
-- l'original (mission §12/§14 "leurs PricingSchedule doivent rester distincts"/"ne pas modifier la
-- modélisation Lot sans preuve"), désormais croisé avec la nullabilité de `candidate_company_id`
-- (mission §9 "jamais deviner" — un chiffrage LEGACY sans candidate reste protégé contre les
-- doublons EXACTEMENT comme avant, entre lui-même et d'autres chiffrages LEGACY du même périmètre,
-- jamais confondu avec un chiffrage qui a une candidate réelle).
DROP INDEX "pricing_schedules_org_tender_lot_client_source_key";
DROP INDEX "pricing_schedules_org_tender_client_source_null_lot_key";

CREATE UNIQUE INDEX "pricing_schedules_org_tender_lot_candidate_source_key" ON "pricing_schedules"("organization_id", "tender_id", "lot_id", "candidate_company_id", "source_document_id") WHERE "lot_id" IS NOT NULL AND "candidate_company_id" IS NOT NULL;
CREATE UNIQUE INDEX "pricing_schedules_org_tender_lot_source_null_candidate_key" ON "pricing_schedules"("organization_id", "tender_id", "lot_id", "source_document_id") WHERE "lot_id" IS NOT NULL AND "candidate_company_id" IS NULL;
CREATE UNIQUE INDEX "pricing_schedules_org_tender_candidate_source_null_lot_key" ON "pricing_schedules"("organization_id", "tender_id", "candidate_company_id", "source_document_id") WHERE "lot_id" IS NULL AND "candidate_company_id" IS NOT NULL;
CREATE UNIQUE INDEX "pricing_schedules_org_tender_source_null_lot_candidate_key" ON "pricing_schedules"("organization_id", "tender_id", "source_document_id") WHERE "lot_id" IS NULL AND "candidate_company_id" IS NULL;
