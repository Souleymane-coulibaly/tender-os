-- Correctif audit Codex P1-003 — colonnes additives, nullables : référence de version IMMUABLE
-- d'un document VÉRIFIÉ (via Documents.GetDocumentUseCase) attaché à une pièce de checklist ou une
-- annexe, jamais une simple chaîne documentId non vérifiée. Dérivées côté serveur au moment de
-- l'association, jamais fournies directement par le client.
ALTER TABLE "checklist_piece_entries" ADD COLUMN "document_version_id" UUID;
ALTER TABLE "checklist_piece_entries" ADD COLUMN "document_checksum" VARCHAR(128);
ALTER TABLE "checklist_piece_entries" ADD COLUMN "document_file_name" VARCHAR(300);
ALTER TABLE "checklist_piece_entries" ADD COLUMN "document_mime_type" VARCHAR(120);

ALTER TABLE "deliverable_annexes" ADD COLUMN "document_version_id" UUID;
ALTER TABLE "deliverable_annexes" ADD COLUMN "document_checksum" VARCHAR(128);
ALTER TABLE "deliverable_annexes" ADD COLUMN "document_file_name" VARCHAR(300);
ALTER TABLE "deliverable_annexes" ADD COLUMN "document_mime_type" VARCHAR(120);
