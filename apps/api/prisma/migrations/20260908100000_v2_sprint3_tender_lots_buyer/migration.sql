-- V2 Sprint 3 — Fiche Appel d'offre (Tender) : enrichissement additif de Tender/TenderLot/
-- TenderAwardCriterion/TenderRequestedDocument/TenderMilestone/TenderRisk + nouveau modèle Buyer.
-- Curatée manuellement à partir de `prisma migrate diff` : le bruit cosmétique sur des tables
-- sans rapport (DropForeignKey ai_suggestions/outbox_events, RenameForeignKey/RenameIndex sur les
-- tables administrative_*, artefacts de l'algorithme de nommage des contraintes Prisma) a été
-- exclu, même discipline que les migrations V2 Sprint 1/Sprint 2.

-- CreateTable
CREATE TABLE "buyers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "legal_name" VARCHAR(300),
    "identifier" VARCHAR(100),
    "siret" VARCHAR(14),
    "address_line" VARCHAR(300),
    "postal_code" VARCHAR(20),
    "city" VARCHAR(120),
    "country" VARCHAR(10),
    "buyer_type" VARCHAR(120),
    "contact_name" VARCHAR(200),
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(40),
    "profile_url" VARCHAR(2048),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buyers_organization_id_name_idx" ON "buyers"("organization_id", "name");
CREATE UNIQUE INDEX "buyers_id_organization_id_key" ON "buyers"("id", "organization_id");

-- AlterTable: tenders
ALTER TABLE "tenders" ADD COLUMN     "buyer_id" UUID,
ADD COLUMN     "minimum_amount" DECIMAL(19,4),
ADD COLUMN     "maximum_amount" DECIMAL(19,4),
ADD COLUMN     "submission_deadline_timezone" VARCHAR(60) DEFAULT 'Europe/Paris',
ADD COLUMN     "questions_deadline" TIMESTAMP(3),
ADD COLUMN     "visit_date" TIMESTAMP(3),
ADD COLUMN     "visit_mandatory" BOOLEAN,
ADD COLUMN     "contract_duration_months" INTEGER,
ADD COLUMN     "renewal_duration_months" INTEGER,
ADD COLUMN     "renewal_count" INTEGER,
ADD COLUMN     "estimated_start_date" TIMESTAMP(3),
ADD COLUMN     "execution_location" VARCHAR(300),
ADD COLUMN     "geographic_zone" VARCHAR(300),
ADD COLUMN     "is_framework_agreement" BOOLEAN,
ADD COLUMN     "award_type" VARCHAR(20),
ADD COLUMN     "variants_allowed" BOOLEAN,
ADD COLUMN     "pse_allowed" BOOLEAN,
ADD COLUMN     "electronic_response_mandatory" BOOLEAN,
ADD COLUMN     "signature_required" BOOLEAN,
ADD COLUMN     "submission_platform_url" VARCHAR(2048),
ADD COLUMN     "internal_notes" TEXT;

ALTER TABLE "tenders" ADD CONSTRAINT "tenders_award_type_check" CHECK ("award_type" IS NULL OR "award_type" IN ('MONO_AWARDEE', 'MULTI_AWARDEE'));
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_buyer_id_organization_id_fkey" FOREIGN KEY ("buyer_id", "organization_id") REFERENCES "buyers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: tender_lots
ALTER TABLE "tender_lots" ADD COLUMN     "code" VARCHAR(100),
ADD COLUMN     "cpv_main" VARCHAR(20),
ADD COLUMN     "cpv_secondary" TEXT[],
ADD COLUMN     "execution_location" VARCHAR(300),
ADD COLUMN     "duration_months" INTEGER,
ADD COLUMN     "estimated_start_date" TIMESTAMP(3),
ADD COLUMN     "minimum_amount" DECIMAL(19,4),
ADD COLUMN     "maximum_amount" DECIMAL(19,4),
ADD COLUMN     "selected_for_response" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "solo_allowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "group_allowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "variants_allowed" BOOLEAN,
ADD COLUMN     "pse_allowed" BOOLEAN,
ADD COLUMN     "specific_visit_required" BOOLEAN,
ADD COLUMN     "specific_visit_date" TIMESTAMP(3),
ADD COLUMN     "internal_notes" TEXT;

CREATE UNIQUE INDEX "tender_lots_id_organization_id_key" ON "tender_lots"("id", "organization_id");

-- AlterTable: tender_award_criteria
ALTER TABLE "tender_award_criteria" ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "type" VARCHAR(40),
ADD COLUMN     "scoring_method" TEXT,
ADD COLUMN     "elimination_threshold" DECIMAL(5,2),
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "tender_award_criteria" ADD CONSTRAINT "tender_award_criteria_type_check" CHECK ("type" IS NULL OR "type" IN ('PRICE', 'TECHNICAL_VALUE', 'DELAY', 'ENVIRONMENTAL', 'SOCIAL', 'OTHER'));
ALTER TABLE "tender_award_criteria" ADD CONSTRAINT "tender_award_criteria_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));
CREATE INDEX "tender_award_criteria_organization_id_lot_id_idx" ON "tender_award_criteria"("organization_id", "lot_id");
ALTER TABLE "tender_award_criteria" ADD CONSTRAINT "tender_award_criteria_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "tender_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: tender_requested_documents
ALTER TABLE "tender_requested_documents" ADD COLUMN     "is_eliminatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "requested_format" VARCHAR(100),
ADD COLUMN     "signature_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buyer_provided_template" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "tender_requested_documents_organization_id_lot_id_idx" ON "tender_requested_documents"("organization_id", "lot_id");
ALTER TABLE "tender_requested_documents" ADD CONSTRAINT "tender_requested_documents_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "tender_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: tender_milestones
ALTER TABLE "tender_milestones" ADD COLUMN     "timezone" VARCHAR(60) DEFAULT 'Europe/Paris',
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "completed_at" TIMESTAMP(3);

CREATE INDEX "tender_milestones_organization_id_lot_id_idx" ON "tender_milestones"("organization_id", "lot_id");
ALTER TABLE "tender_milestones" ADD CONSTRAINT "tender_milestones_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "tender_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: tender_risks
ALTER TABLE "tender_risks" ADD COLUMN     "category" VARCHAR(40),
ADD COLUMN     "probability" VARCHAR(20),
ADD COLUMN     "impact" VARCHAR(20),
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "origin" VARCHAR(20) NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "tender_risks" ADD CONSTRAINT "tender_risks_category_check" CHECK ("category" IS NULL OR "category" IN ('ADMINISTRATIVE', 'LEGAL', 'TECHNICAL', 'FINANCIAL', 'PLANNING', 'RESOURCE', 'SECURITY', 'OTHER'));
ALTER TABLE "tender_risks" ADD CONSTRAINT "tender_risks_probability_check" CHECK ("probability" IS NULL OR "probability" IN ('LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE "tender_risks" ADD CONSTRAINT "tender_risks_impact_check" CHECK ("impact" IS NULL OR "impact" IN ('LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE "tender_risks" ADD CONSTRAINT "tender_risks_origin_check" CHECK ("origin" IN ('MANUAL'));
CREATE INDEX "tender_risks_organization_id_lot_id_idx" ON "tender_risks"("organization_id", "lot_id");
ALTER TABLE "tender_risks" ADD CONSTRAINT "tender_risks_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "tender_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
