-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "triggered_by_role" VARCHAR(40);

-- CreateTable
CREATE TABLE "document_business_analyses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "tender_id" UUID NOT NULL,
    "dce_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "extraction_version" INTEGER NOT NULL,
    "document_type" VARCHAR(20) NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "deadlines" JSONB NOT NULL DEFAULT '[]',
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "clauses" JSONB NOT NULL DEFAULT '[]',
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_business_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_deadline_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "date" TIMESTAMP(3),
    "raw_text" TEXT,
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "citation" VARCHAR(500),
    "is_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_deadline_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_criterion_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "weight" DOUBLE PRECISION,
    "sub_criteria" JSONB,
    "scoring_method" TEXT,
    "price_formula" TEXT,
    "threshold" TEXT,
    "is_eliminatory" BOOLEAN NOT NULL DEFAULT false,
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "citation" VARCHAR(500),
    "is_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_criterion_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_requirement_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "expected_format" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "citation" VARCHAR(500),
    "is_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_requirement_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_clause_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "summary" TEXT NOT NULL,
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "citation" VARCHAR(500),
    "is_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_clause_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_risk_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "probability" DOUBLE PRECISION,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "citation" VARCHAR(500),
    "is_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_risk_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_question_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "theme" VARCHAR(120) NOT NULL,
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "citation" VARCHAR(500),
    "is_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_question_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_analysis_summaries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "opportunity_summary" TEXT NOT NULL,
    "complexity_level" VARCHAR(20) NOT NULL,
    "main_criteria" JSONB NOT NULL DEFAULT '[]',
    "main_risks" JSONB NOT NULL DEFAULT '[]',
    "main_obligations" JSONB NOT NULL DEFAULT '[]',
    "missing_elements" JSONB NOT NULL DEFAULT '[]',
    "points_to_clarify" JSONB NOT NULL DEFAULT '[]',
    "conflicts" JSONB NOT NULL DEFAULT '[]',
    "go_no_go_recommendation" VARCHAR(30) NOT NULL,
    "go_no_go_rationale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_analysis_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_business_analyses_organization_id_tender_id_idx" ON "document_business_analyses"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_business_analyses_organization_id_document_id_anal_key" ON "document_business_analyses"("organization_id", "document_id", "analysis_version");

-- CreateIndex
CREATE INDEX "tender_deadline_findings_organization_id_tender_id_analysis_idx" ON "tender_deadline_findings"("organization_id", "tender_id", "analysis_version");

-- CreateIndex
CREATE INDEX "tender_criterion_findings_organization_id_tender_id_analysi_idx" ON "tender_criterion_findings"("organization_id", "tender_id", "analysis_version");

-- CreateIndex
CREATE INDEX "tender_requirement_findings_organization_id_tender_id_analy_idx" ON "tender_requirement_findings"("organization_id", "tender_id", "analysis_version");

-- CreateIndex
CREATE INDEX "tender_clause_findings_organization_id_tender_id_analysis_v_idx" ON "tender_clause_findings"("organization_id", "tender_id", "analysis_version");

-- CreateIndex
CREATE INDEX "tender_risk_findings_organization_id_tender_id_analysis_ver_idx" ON "tender_risk_findings"("organization_id", "tender_id", "analysis_version");

-- CreateIndex
CREATE INDEX "tender_risk_findings_organization_id_tender_id_severity_idx" ON "tender_risk_findings"("organization_id", "tender_id", "severity");

-- CreateIndex
CREATE INDEX "tender_question_findings_organization_id_tender_id_analysis_idx" ON "tender_question_findings"("organization_id", "tender_id", "analysis_version");

-- CreateIndex
CREATE UNIQUE INDEX "tender_analysis_summaries_organization_id_tender_id_analysi_key" ON "tender_analysis_summaries"("organization_id", "tender_id", "analysis_version");

-- AddForeignKey
ALTER TABLE "document_business_analyses" ADD CONSTRAINT "document_business_analyses_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_business_analyses" ADD CONSTRAINT "document_business_analyses_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_business_analyses" ADD CONSTRAINT "document_business_analyses_dce_id_organization_id_fkey" FOREIGN KEY ("dce_id", "organization_id") REFERENCES "dces"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_business_analyses" ADD CONSTRAINT "document_business_analyses_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_deadline_findings" ADD CONSTRAINT "tender_deadline_findings_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_deadline_findings" ADD CONSTRAINT "tender_deadline_findings_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_criterion_findings" ADD CONSTRAINT "tender_criterion_findings_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_criterion_findings" ADD CONSTRAINT "tender_criterion_findings_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_requirement_findings" ADD CONSTRAINT "tender_requirement_findings_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_requirement_findings" ADD CONSTRAINT "tender_requirement_findings_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_clause_findings" ADD CONSTRAINT "tender_clause_findings_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_clause_findings" ADD CONSTRAINT "tender_clause_findings_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_risk_findings" ADD CONSTRAINT "tender_risk_findings_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_risk_findings" ADD CONSTRAINT "tender_risk_findings_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_question_findings" ADD CONSTRAINT "tender_question_findings_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_question_findings" ADD CONSTRAINT "tender_question_findings_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_analysis_summaries" ADD CONSTRAINT "tender_analysis_summaries_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_analysis_summaries" ADD CONSTRAINT "tender_analysis_summaries_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (mission Sprint 4.2 — même motif que la correction P1-05, module Extraction,
-- et la migration Sprint 4.1 add_analysis_module) : protège au niveau PostgreSQL les valeurs
-- fermées déjà validées côté domaine/Zod, dès la création de ces tables. Purement additive, non
-- destructive : aucune ligne supprimée ou modifiée, ces tables sont neuves.

ALTER TABLE "document_business_analyses"
  ADD CONSTRAINT "document_business_analyses_document_type_check"
  CHECK ("document_type" IN ('RC', 'CCTP', 'CCAP', 'AE', 'BPU', 'DPGF', 'ANNEX', 'UNKNOWN'));

ALTER TABLE "tender_deadline_findings"
  ADD CONSTRAINT "tender_deadline_findings_kind_check"
  CHECK ("kind" IN ('PUBLICATION', 'SUBMISSION', 'QUESTIONS', 'ANSWER', 'VISIT', 'START_ESTIMATED', 'VALIDITY_PERIOD', 'INTERMEDIATE', 'CONTRACTUAL', 'OTHER'));

-- Une échéance normalisée porte soit une date, soit (à défaut) le texte brut source — jamais ni
-- l'un ni l'autre (mission §"Chaque date doit être normalisée... si une information est déduite,
-- indiquer explicitement qu'il s'agit d'une inférence").
ALTER TABLE "tender_deadline_findings"
  ADD CONSTRAINT "tender_deadline_findings_date_or_raw_text_check"
  CHECK ("date" IS NOT NULL OR "raw_text" IS NOT NULL);

ALTER TABLE "tender_requirement_findings"
  ADD CONSTRAINT "tender_requirement_findings_category_check"
  CHECK ("category" IN ('ADMINISTRATIVE', 'TECHNICAL_MEMO', 'REFERENCES', 'CV', 'CERTIFICATION', 'INSURANCE', 'FINANCIAL_CAPACITY', 'TECHNICAL_CAPACITY', 'HUMAN_RESOURCES', 'MATERIAL_RESOURCES', 'METHODOLOGY', 'PLANNING', 'SIGNATURE', 'OTHER'));

ALTER TABLE "tender_clause_findings"
  ADD CONSTRAINT "tender_clause_findings_category_check"
  CHECK ("category" IN ('PENALTY', 'WARRANTY', 'INSURANCE', 'DEADLINE', 'CONFIDENTIALITY', 'IP', 'SECURITY', 'CYBERSECURITY', 'REVERSIBILITY', 'SUBCONTRACTING', 'CONSORTIUM', 'ADVANCE_PAYMENT', 'RETENTION_GUARANTEE', 'PAYMENT', 'INVOICING', 'TERMINATION', 'RENEWAL', 'LIABILITY', 'GDPR', 'HOSTING', 'ENVIRONMENTAL_SOCIAL', 'OTHER'));

ALTER TABLE "tender_risk_findings"
  ADD CONSTRAINT "tender_risk_findings_severity_check"
  CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

ALTER TABLE "tender_question_findings"
  ADD CONSTRAINT "tender_question_findings_priority_check"
  CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH'));

ALTER TABLE "tender_analysis_summaries"
  ADD CONSTRAINT "tender_analysis_summaries_complexity_level_check"
  CHECK ("complexity_level" IN ('LOW', 'MEDIUM', 'HIGH'));

ALTER TABLE "tender_analysis_summaries"
  ADD CONSTRAINT "tender_analysis_summaries_go_no_go_recommendation_check"
  CHECK ("go_no_go_recommendation" IN ('GO', 'GO_WITH_RESERVATIONS', 'NO_GO', 'INSUFFICIENT_DATA'));

-- Score de confiance normalisé entre 0 et 1 (mission §"Score de confiance") sur toutes les tables
-- Finding.
ALTER TABLE "tender_deadline_findings" ADD CONSTRAINT "tender_deadline_findings_confidence_range_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);
ALTER TABLE "tender_criterion_findings" ADD CONSTRAINT "tender_criterion_findings_confidence_range_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);
ALTER TABLE "tender_requirement_findings" ADD CONSTRAINT "tender_requirement_findings_confidence_range_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);
ALTER TABLE "tender_clause_findings" ADD CONSTRAINT "tender_clause_findings_confidence_range_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);
ALTER TABLE "tender_risk_findings" ADD CONSTRAINT "tender_risk_findings_confidence_range_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);
ALTER TABLE "tender_question_findings" ADD CONSTRAINT "tender_question_findings_confidence_range_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);

-- Pondération d'un critère, si renseignée, reste un pourcentage plausible (mission §"Vérifier...
-- total proche de 100 %" — la somme est vérifiée applicativement, cette borne protège uniquement
-- contre une valeur aberrante par ligne, ex. négative ou à quatre chiffres).
ALTER TABLE "tender_criterion_findings" ADD CONSTRAINT "tender_criterion_findings_weight_range_check" CHECK ("weight" IS NULL OR ("weight" >= 0 AND "weight" <= 100));
