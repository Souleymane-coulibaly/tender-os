-- Correction P1-05 (audit Sprint 3 — Codex) : protège au niveau PostgreSQL les valeurs fermées
-- déjà validées côté domaine (statuts, stratégies, outcomes) et l'unicité (document_id,
-- attempt_number). Purement additive, non destructive : aucune ligne supprimée ou modifiée.
-- Valeurs existantes vérifiées avant écriture de cette migration (document_extractions et
-- extraction_attempts étaient vides ; dce_documents ne contenait que des valeurs déjà valides).

-- CreateIndex
CREATE INDEX "document_extractions_organization_id_status_idx" ON "document_extractions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_attempts_document_id_attempt_number_key" ON "extraction_attempts"("document_id", "attempt_number");

-- CHECK constraints (correction P1-05) — Prisma ne modélise pas nativement les contraintes CHECK
-- dans ce projet (aucun autre modèle du schéma n'en utilise) : ajoutées ici en SQL brut, sur des
-- colonnes qui restent de simples VARCHAR côté Prisma (jamais un type enum PostgreSQL natif,
-- pour rester cohérent avec le reste du schéma et éviter la rigidité d'ALTER TYPE lors d'un futur
-- ajout de valeur).

ALTER TABLE "document_extractions"
  ADD CONSTRAINT "document_extractions_status_check"
  CHECK ("status" IN ('PENDING', 'READY', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'NOT_PROCESSABLE'));

ALTER TABLE "document_extractions"
  ADD CONSTRAINT "document_extractions_strategy_check"
  CHECK ("strategy" IS NULL OR "strategy" IN ('NATIVE_TEXT', 'OCR', 'OFFICE_DOCUMENT', 'SPREADSHEET', 'UNSUPPORTED'));

ALTER TABLE "extraction_attempts"
  ADD CONSTRAINT "extraction_attempts_strategy_check"
  CHECK ("strategy" IN ('NATIVE_TEXT', 'OCR', 'OFFICE_DOCUMENT', 'SPREADSHEET', 'UNSUPPORTED'));

ALTER TABLE "extraction_attempts"
  ADD CONSTRAINT "extraction_attempts_outcome_check"
  CHECK ("outcome" IN ('SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED'));

ALTER TABLE "dce_documents"
  ADD CONSTRAINT "dce_documents_processing_status_check"
  CHECK ("processing_status" IN (
    'IMPORTED',
    'READY_FOR_OCR',
    'PENDING_TEXT_INSPECTION',
    'READY_FOR_NATIVE_EXTRACTION',
    'NOT_PROCESSABLE',
    'READY_FOR_ANALYSIS',
    'READY_FOR_ANALYSIS_WITH_WARNINGS'
  ));
