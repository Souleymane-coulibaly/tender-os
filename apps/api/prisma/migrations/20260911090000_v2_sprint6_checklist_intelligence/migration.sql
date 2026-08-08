-- V2 Sprint 6 — Checklist intelligente DCE. Enrichissement additif de `tender_checklist_items`
-- (V1, table déjà existante) : type gouverné, niveau d'exigence, criticité, statut métier séparé
-- du statut documentaire, origine, sujet concerné, lot, rapprochement documentaire. Nouvelle table
-- `tender_checklist_item_sources` pour la traçabilité multi-provenance. Aucune ancienne migration
-- modifiée, aucune colonne/table supprimée, aucune donnée `tender_requested_documents` touchée.

-- AlterTable: tender_checklist_items
ALTER TABLE "tender_checklist_items" ADD COLUMN     "type" VARCHAR(30) NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "requirement_level" VARCHAR(15) NOT NULL DEFAULT 'MANDATORY',
ADD COLUMN     "condition_text" TEXT,
ADD COLUMN     "criticality" VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "compliance_status" VARCHAR(15) NOT NULL DEFAULT 'TO_REVIEW',
ADD COLUMN     "document_status" VARCHAR(10) NOT NULL DEFAULT 'MISSING',
ADD COLUMN     "origin" VARCHAR(15) NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "subject_type" VARCHAR(15) NOT NULL DEFAULT 'CANDIDATE',
ADD COLUMN     "subject_subcontractor_profile_id" UUID,
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "matched_document_id" UUID,
ADD COLUMN     "matched_document_version_id" UUID,
ADD COLUMN     "document_match_status" VARCHAR(20) NOT NULL DEFAULT 'NOT_SEARCHED',
ADD COLUMN     "document_match_score" DOUBLE PRECISION,
ADD COLUMN     "document_match_reasons" JSONB,
ADD COLUMN     "document_expires_at" TIMESTAMP(3),
ADD COLUMN     "document_validity_checked_at" TIMESTAMP(3);

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_type_check"
  CHECK ("type" IN ('ADMINISTRATIVE_DOCUMENT', 'TECHNICAL_DOCUMENT', 'FINANCIAL_DOCUMENT', 'CERTIFICATION', 'INSURANCE', 'DECLARATION', 'FORM', 'SIGNATURE', 'VISIT', 'REFERENCE', 'TECHNICAL_REQUIREMENT', 'FINANCIAL_REQUIREMENT', 'DEADLINE', 'DELIVERABLE', 'OTHER'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_requirement_level_check"
  CHECK ("requirement_level" IN ('MANDATORY', 'CONDITIONAL', 'INFORMATIONAL'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_criticality_check"
  CHECK ("criticality" IN ('BLOCKING', 'HIGH', 'MEDIUM', 'LOW'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_compliance_status_check"
  CHECK ("compliance_status" IN ('TO_REVIEW', 'NON_COMPLIANT', 'READY', 'VALIDATED', 'NOT_APPLICABLE'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_document_status_check"
  CHECK ("document_status" IN ('MISSING', 'AVAILABLE', 'EXPIRED'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_origin_check"
  CHECK ("origin" IN ('MANUAL', 'AI_SUGGESTION', 'SYSTEM'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_subject_type_check"
  CHECK ("subject_type" IN ('CANDIDATE', 'GROUP_MEMBER', 'SUBCONTRACTOR', 'ANY_MEMBER', 'TENDER', 'LOT'));

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_document_match_status_check"
  CHECK ("document_match_status" IN ('NOT_SEARCHED', 'EXACT_MATCH', 'PROBABLE_MATCH', 'MULTIPLE_CANDIDATES', 'NO_MATCH', 'MANUALLY_ATTACHED'));

CREATE INDEX "tender_checklist_items_organization_id_tender_id_lot_id_idx" ON "tender_checklist_items"("organization_id", "tender_id", "lot_id");
CREATE INDEX "tender_checklist_items_organization_id_tender_id_complianc_idx" ON "tender_checklist_items"("organization_id", "tender_id", "compliance_status");

-- AUDIT-007 : FK composée (lotId, organizationId) → TenderLot(id, organizationId) — même motif que
-- tender_requested_documents/tender_award_criteria/tender_milestones (V2 Sprint 3).
ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "tender_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK réelle vers Document (même motif que tender_requested_documents.document_id) — jamais vers
-- DocumentVersion (toujours dénormalisé dans ce dépôt, aucune version "latest" implicite).
ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_matched_document_id_fkey" FOREIGN KEY ("matched_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: tender_checklist_item_sources — provenances multiples (§11), jamais supprimées.
CREATE TABLE "tender_checklist_item_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "finding_type" VARCHAR(15),
    "finding_id" UUID,
    "source_suggestion_id" UUID,
    "document_id" UUID,
    "document_version_id" UUID,
    "analysis_version" INTEGER,
    "page_start" INTEGER,
    "citation" TEXT,
    "section_title" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_checklist_item_sources_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tender_checklist_item_sources" ADD CONSTRAINT "tender_checklist_item_sources_finding_type_check"
  CHECK ("finding_type" IS NULL OR "finding_type" IN ('REQUIREMENT', 'CRITERION', 'DEADLINE'));

CREATE INDEX "tender_checklist_item_sources_organization_id_checklist_it_idx" ON "tender_checklist_item_sources"("organization_id", "checklist_item_id");

ALTER TABLE "tender_checklist_item_sources" ADD CONSTRAINT "tender_checklist_item_sources_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "tender_checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
