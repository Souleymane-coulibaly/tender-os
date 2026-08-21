-- Checkpoint TENDEROS-2.1-P2.2-F3 — provenance CandidateCompany ADDITIVE sur
-- "administrative_document_revisions" (mission §18/§25/§26/§42 : une révision (DC1/DC2/DC4...)
-- capturée pour un candidat A ne doit jamais rester silencieusement valide pour un candidat B après
-- un changement de Candidate sur le Tender). Colonne nullable, jamais backfillée pour les lignes
-- existantes (mission §27 "ne pas casser l'historique") — aucune FK stricte inter-agrégat, même
-- discipline que les autres colonnes de provenance dénormalisée déjà présentes sur cette table
-- (documentId/documentVersionId/documentChecksum...).
ALTER TABLE "administrative_document_revisions" ADD COLUMN "candidate_company_id" UUID;

CREATE INDEX "administrative_document_revisions_organization_id_candidate_company_id_idx" ON "administrative_document_revisions"("organization_id", "candidate_company_id");
