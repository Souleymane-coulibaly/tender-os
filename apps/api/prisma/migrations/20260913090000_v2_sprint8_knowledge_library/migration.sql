-- V2 Sprint 8 (Bibliothèque intelligente / Knowledge Base) — migration additive, aucune colonne
-- retirée, aucune donnée existante réécrite.
--
-- Validation humaine (mission §15/§16) — ORTHOGONALE au `status` pipeline d'extraction existant
-- (DRAFT/PROCESSING/READY/PARTIALLY_READY/FAILED/ARCHIVED, inchangé) : `knowledge_entries` porte
-- une dénormalisation "la version active est-elle validée" (filtrage bon marché en liste/recherche),
-- `knowledge_entry_versions` porte la vérité historique PAR VERSION (une ancienne version validée
-- le reste pour toujours, mission §71/72). Toute nouvelle version réinitialise la dénormalisation
-- côté application (jamais un trigger SQL) — voir `KnowledgeEntry.updateMetadata`/`startDocumentProcessing`.
--
-- Provenance (mission §18) — renseignée uniquement par `PromoteChecklistItemToKnowledgeUseCase`,
-- jamais imposable par le client (reconstruite côté serveur).

ALTER TABLE "knowledge_entries"
  ADD COLUMN     "validated_by_user_id" UUID,
  ADD COLUMN     "validated_at" TIMESTAMP(3),
  ADD COLUMN     "source_tender_id" UUID,
  ADD COLUMN     "source_checklist_item_id" UUID,
  ADD COLUMN     "source_document_id" UUID,
  ADD COLUMN     "source_document_version_id" UUID,
  ADD COLUMN     "promoted_by_user_id" UUID,
  ADD COLUMN     "promoted_at" TIMESTAMP(3);

ALTER TABLE "knowledge_entry_versions"
  ADD COLUMN     "validated_by_user_id" UUID,
  ADD COLUMN     "validated_at" TIMESTAMP(3);

CREATE INDEX "knowledge_entries_organization_id_validated_at_idx" ON "knowledge_entries"("organization_id", "validated_at");

-- Cohérence provenance : une référence de version de document implique la référence du document
-- lui-même — jamais l'une sans l'autre.
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_source_document_version_check"
  CHECK ("source_document_version_id" IS NULL OR "source_document_id" IS NOT NULL);

-- Catalogue de catégories (mission §6) — ajout de la seule valeur manquante du catalogue de
-- référence de la mission, IMAGE (logos/organigrammes/photos/schémas, mission §40). Les 15 valeurs
-- existantes sont conservées à l'identique (jamais retirées ni renommées).
ALTER TABLE "knowledge_entries" DROP CONSTRAINT "knowledge_entries_category_check";
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_category_check"
  CHECK ("category" IN (
    'COMPANY_PRESENTATION', 'CLIENT_REFERENCE', 'CONSULTANT_PROFILE', 'CERTIFICATION', 'METHODOLOGY',
    'SERVICE_OFFER', 'CASE_STUDY', 'SECURITY', 'GDPR', 'CSR', 'ADMINISTRATIVE', 'TECHNICAL_MEMORY',
    'RESPONSE_TEMPLATE', 'COMMERCIAL_DOCUMENT', 'IMAGE', 'OTHER'
  ));
