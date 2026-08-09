-- Correctif audit Codex P2 (Sprint 11B) — filet de sécurité de dernier recours contre une lignée
-- GeneratedDocument dupliquée sous concurrence, en complément du verrou consultatif de portée
-- (`lockGenerationScope`). Deux index partiels : Postgres traite chaque `subject_id` NULL comme
-- distinct dans un index unique classique, donc DC1 (subject_id toujours NULL) a besoin de son
-- propre index dédié à ce cas.
CREATE UNIQUE INDEX "generated_documents_org_tender_template_subject_key" ON "generated_documents"("organization_id", "tender_id", "document_template_id", "subject_id") WHERE "subject_id" IS NOT NULL;
CREATE UNIQUE INDEX "generated_documents_org_tender_template_null_subject_key" ON "generated_documents"("organization_id", "tender_id", "document_template_id") WHERE "subject_id" IS NULL;
