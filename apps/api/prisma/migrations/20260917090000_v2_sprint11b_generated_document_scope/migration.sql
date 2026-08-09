-- V2 Sprint 11B — clé de portée générique sur GeneratedDocument, permet de retrouver-ou-créer la
-- bonne lignée avant chaque génération (DC1 = tenderId seul, DC4 = subcontractorDeclarationId,
-- DC2 = tenderId + candidat|membre de groupement), jamais une nouvelle lignée à chaque appel.
ALTER TABLE "generated_documents" ADD COLUMN "subject_id" VARCHAR(200);

CREATE INDEX "generated_documents_organization_id_tender_id_document_te_idx" ON "generated_documents"("organization_id", "tender_id", "document_template_id", "subject_id");
