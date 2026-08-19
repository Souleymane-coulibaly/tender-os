-- Checkpoint 2.1-A6.2 (correctif audit — P2 "fraîcheur candidate après changement")
--
-- Ajoute go_no_go_reports.candidate_company_id : instantané de Tender.candidate_company_id au
-- moment du calcul du rapport, jamais re-résolu ensuite (même discipline que analysis_version,
-- déjà présent sur cette table). NULL si aucune CandidateCompany n'était résolue à ce moment
-- (Tender legacy ou candidat non encore sélectionné).
--
-- Additif uniquement : colonne nullable, aucune valeur par défaut forcée, aucun backfill des
-- lignes existantes (leurs rapports ont été générés avant ce checkpoint — on ne invente pas
-- rétroactivement quelle CandidateCompany était "active" à l'époque, cela resterait NULL, ce qui
-- est honnête : ces anciens rapports seront simplement traités comme "sans candidate connue au
-- moment du calcul" par la détection de fraîcheur, jamais une valeur fabriquée).
--
-- Pas de relation Prisma déclarée (même discipline que routing_decisions.analysis_id/
-- generation_id, candidate_companies.source_client_account_id) : un simple pointeur scalaire
-- indexé, jamais un couplage structurel avec la table candidate_companies.
--
-- Aucune suppression, aucun DROP, aucune migration destructive.

ALTER TABLE "go_no_go_reports" ADD COLUMN "candidate_company_id" UUID;

CREATE INDEX "go_no_go_reports_organization_id_candidate_company_id_idx" ON "go_no_go_reports"("organization_id", "candidate_company_id");
