-- AlterTable — traçabilité générique OfficialSourceDocument -> DerivedTenderOSTemplate ->
-- DocumentTemplateVersion (mission Sprint 11 §"Ne jamais modifier le DOCX officiel").
ALTER TABLE "document_template_versions" ADD COLUMN "official_source_document_id" UUID;
ALTER TABLE "document_template_versions" ADD COLUMN "official_source_document_version_id" UUID;
ALTER TABLE "document_template_versions" ADD COLUMN "official_source_checksum" VARCHAR(64);
