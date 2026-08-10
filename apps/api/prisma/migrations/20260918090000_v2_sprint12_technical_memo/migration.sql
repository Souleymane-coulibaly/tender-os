-- CreateTable
CREATE TABLE "technical_memos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "lot_id" UUID,
    "template_origin" VARCHAR(30) NOT NULL,
    "original_document_id" UUID,
    "original_document_version_id" UUID,
    "document_template_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_memo_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technical_memo_id" UUID NOT NULL,
    "parent_section_id" UUID,
    "section_key" VARCHAR(80) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "order" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "category" VARCHAR(30) NOT NULL DEFAULT 'NEEDS_MAPPING',
    "category_confirmed_by_user" BOOLEAN NOT NULL DEFAULT false,
    "instruction_text" TEXT,
    "is_table" BOOLEAN NOT NULL DEFAULT false,
    "word_limit" INTEGER,
    "page_limit" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
    "content" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_memo_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_memo_section_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technical_memo_section_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "user_instruction" TEXT,
    "ai_model" VARCHAR(100),
    "prompt_version" INTEGER,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "total_token_count" INTEGER,
    "missing_data_notes" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_memo_section_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_memo_section_citations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technical_memo_section_revision_id" UUID NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "finding_type" VARCHAR(30),
    "finding_id" UUID,
    "knowledge_entry_id" UUID,
    "knowledge_entry_version_id" UUID,
    "company_reference_id" UUID,
    "candidate_field_path" VARCHAR(120),
    "document_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "label" VARCHAR(300) NOT NULL,
    "excerpt" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_memo_section_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_memo_section_requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technical_memo_section_id" UUID NOT NULL,
    "finding_type" VARCHAR(30) NOT NULL,
    "finding_id" UUID NOT NULL,
    "coverage_status" VARCHAR(20) NOT NULL DEFAULT 'NEEDS_REVIEW',
    "coverage_reason" TEXT,
    "confirmed_by_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_memo_section_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technical_memos_id_organization_id_key" ON "technical_memos"("id", "organization_id");
CREATE INDEX "technical_memos_organization_id_tender_id_idx" ON "technical_memos"("organization_id", "tender_id");
-- Au plus un TechnicalMemo par (tenderId, lotId) — deux index partiels (même motif que
-- generated_documents_org_tender_template_subject_key, Sprint 11B) : Postgres traite chaque
-- lotId NULL comme distinct dans un index unique classique.
CREATE UNIQUE INDEX "technical_memos_org_tender_lot_key" ON "technical_memos"("organization_id", "tender_id", "lot_id") WHERE "lot_id" IS NOT NULL;
CREATE UNIQUE INDEX "technical_memos_org_tender_null_lot_key" ON "technical_memos"("organization_id", "tender_id") WHERE "lot_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "technical_memo_sections_id_organization_id_key" ON "technical_memo_sections"("id", "organization_id");
CREATE UNIQUE INDEX "technical_memo_sections_technical_memo_id_section_key_key" ON "technical_memo_sections"("technical_memo_id", "section_key");
CREATE INDEX "technical_memo_sections_organization_id_technical_memo_id_idx" ON "technical_memo_sections"("organization_id", "technical_memo_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "technical_memo_section_revisions_id_organization_id_key" ON "technical_memo_section_revisions"("id", "organization_id");
CREATE UNIQUE INDEX "technical_memo_section_revisions_section_id_revision_num_key" ON "technical_memo_section_revisions"("technical_memo_section_id", "revision_number");
CREATE INDEX "technical_memo_section_revisions_organization_id_section_idx" ON "technical_memo_section_revisions"("organization_id", "technical_memo_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "technical_memo_section_citations_id_organization_id_key" ON "technical_memo_section_citations"("id", "organization_id");
CREATE INDEX "technical_memo_section_citations_organization_id_revision_idx" ON "technical_memo_section_citations"("organization_id", "technical_memo_section_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "technical_memo_section_requirements_id_organization_id_key" ON "technical_memo_section_requirements"("id", "organization_id");
CREATE UNIQUE INDEX "technical_memo_section_requirements_section_finding_key" ON "technical_memo_section_requirements"("technical_memo_section_id", "finding_type", "finding_id");
CREATE INDEX "technical_memo_section_requirements_org_finding_idx" ON "technical_memo_section_requirements"("organization_id", "finding_type", "finding_id");

-- AddForeignKey
ALTER TABLE "technical_memos" ADD CONSTRAINT "technical_memos_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_memo_sections" ADD CONSTRAINT "technical_memo_sections_technical_memo_id_organization_id_fkey" FOREIGN KEY ("technical_memo_id", "organization_id") REFERENCES "technical_memos"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_memo_section_revisions" ADD CONSTRAINT "technical_memo_section_revisions_section_id_organization_fkey" FOREIGN KEY ("technical_memo_section_id", "organization_id") REFERENCES "technical_memo_sections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_memo_section_citations" ADD CONSTRAINT "technical_memo_section_citations_revision_id_organization_fkey" FOREIGN KEY ("technical_memo_section_revision_id", "organization_id") REFERENCES "technical_memo_section_revisions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_memo_section_requirements" ADD CONSTRAINT "technical_memo_section_requirements_section_id_organizat_fkey" FOREIGN KEY ("technical_memo_section_id", "organization_id") REFERENCES "technical_memo_sections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "technical_memos" ADD CONSTRAINT "technical_memos_template_origin_check" CHECK ("template_origin" IN ('COMPANY_TEMPLATE','DCE_REQUIRED_TEMPLATE','TENDEROS_SYSTEM'));
ALTER TABLE "technical_memos" ADD CONSTRAINT "technical_memos_status_check" CHECK ("status" IN ('DRAFT','READY','EXPORTED'));
ALTER TABLE "technical_memo_sections" ADD CONSTRAINT "technical_memo_sections_category_check" CHECK ("category" IN ('COMPANY_PRESENTATION','UNDERSTANDING','METHODOLOGY','ORGANIZATION','HUMAN_RESOURCES','TECHNICAL_RESOURCES','PLANNING','QUALITY','SECURITY','ENVIRONMENT','CSR','CONTINUITY','REFERENCES','INNOVATION','GOVERNANCE','OTHER','NEEDS_MAPPING'));
ALTER TABLE "technical_memo_sections" ADD CONSTRAINT "technical_memo_sections_status_check" CHECK ("status" IN ('EMPTY','READY_TO_GENERATE','GENERATING','DRAFT','NEEDS_REVIEW','VALIDATED','FAILED'));
ALTER TABLE "technical_memo_section_revisions" ADD CONSTRAINT "technical_memo_section_revisions_source_check" CHECK ("source" IN ('AI_GENERATED','MANUAL','AI_REGENERATED'));
ALTER TABLE "technical_memo_section_citations" ADD CONSTRAINT "technical_memo_section_citations_source_type_check" CHECK ("source_type" IN ('FINDING','KNOWLEDGE_ENTRY','CANDIDATE_FIELD','REFERENCE','DCE_CHUNK'));
ALTER TABLE "technical_memo_section_requirements" ADD CONSTRAINT "technical_memo_section_requirements_finding_type_check" CHECK ("finding_type" IN ('REQUIREMENT','CRITERION','CLAUSE'));
ALTER TABLE "technical_memo_section_requirements" ADD CONSTRAINT "technical_memo_section_requirements_coverage_status_check" CHECK ("coverage_status" IN ('COVERED','PARTIALLY_COVERED','NOT_COVERED','NOT_APPLICABLE','NEEDS_REVIEW'));
