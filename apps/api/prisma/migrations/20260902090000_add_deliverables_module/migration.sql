-- CreateTable
CREATE TABLE "deliverable_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope_level" VARCHAR(12) NOT NULL,
    "client_account_id" UUID,
    "tender_id" UUID,
    "document_type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_template_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "deliverable_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_template_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_template_version_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "heading_level" INTEGER NOT NULL DEFAULT 1,
    "requirement" VARCHAR(12) NOT NULL DEFAULT 'OPTIONAL',
    "display_condition" TEXT,
    "recommended_length" INTEGER,
    "max_characters" INTEGER,
    "max_pages" INTEGER,
    "instructions" TEXT,
    "style_hint" TEXT,
    "task_type" VARCHAR(30),
    "allowed_variables" JSONB NOT NULL DEFAULT '[]',
    "validation_required" BOOLEAN NOT NULL DEFAULT true,
    "page_break_before" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "deliverable_template_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_themes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope_level" VARCHAR(12) NOT NULL,
    "client_account_id" UUID,
    "tender_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_theme_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_theme_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'DRAFT',
    "logo_storage_key" VARCHAR(500),
    "accent_color" VARCHAR(7),
    "font_family" VARCHAR(100),
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "document_theme_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
    "template_version_id" UUID,
    "template_source_level" VARCHAR(12),
    "theme_version_id" UUID,
    "theme_source_level" VARCHAR(12),
    "theme_selected_by" UUID,
    "theme_selected_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "order" INTEGER NOT NULL,
    "heading_level" INTEGER NOT NULL DEFAULT 1,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliverable_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_section_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "source_type" VARCHAR(12) NOT NULL,
    "source_generation_id" UUID,
    "source_generation_version_number" INTEGER,
    "content_structured" JSONB NOT NULL,
    "content_text" TEXT NOT NULL,
    "character_count" INTEGER NOT NULL,
    "status" VARCHAR(18) NOT NULL DEFAULT 'DRAFT',
    "edit_version" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_by_role" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "change_note" TEXT,

    CONSTRAINT "deliverable_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_revision_id" UUID NOT NULL,
    "decision" VARCHAR(18) NOT NULL,
    "comment" TEXT,
    "decided_by" UUID NOT NULL,
    "decided_by_role" VARCHAR(30) NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "deliverable_section_id" UUID,
    "deliverable_revision_id" UUID,
    "content" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(8) NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "deliverable_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_export_selections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_section_id" UUID NOT NULL,
    "deliverable_revision_id" UUID NOT NULL,
    "selected_by" UUID NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "justification" TEXT,

    CONSTRAINT "deliverable_export_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_matrix_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "requirement_id" UUID,
    "source" VARCHAR(300) NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "criticality" VARCHAR(8) NOT NULL DEFAULT 'MEDIUM',
    "response" TEXT,
    "deliverable_section_ref" VARCHAR(80),
    "proof_reference" TEXT,
    "coverage_status" VARCHAR(18) NOT NULL DEFAULT 'TO_CONFIRM',
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_matrix_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_piece_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "source" VARCHAR(300),
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "format" VARCHAR(60),
    "document_id" UUID,
    "version" VARCHAR(40),
    "expires_at" TIMESTAMP(3),
    "signature_required" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(10) NOT NULL DEFAULT 'MISSING',
    "responsible_user_id" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_piece_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_annexes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "source" VARCHAR(300),
    "document_id" UUID,
    "version" VARCHAR(40),
    "status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_annexes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliverable_templates_organization_id_document_type_scope_l_idx" ON "deliverable_templates"("organization_id", "document_type", "scope_level");

-- CreateIndex
CREATE INDEX "deliverable_templates_organization_id_client_account_id_idx" ON "deliverable_templates"("organization_id", "client_account_id");

-- CreateIndex
CREATE INDEX "deliverable_templates_organization_id_tender_id_idx" ON "deliverable_templates"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_templates_id_organization_id_key" ON "deliverable_templates"("id", "organization_id");

-- CreateIndex
CREATE INDEX "deliverable_template_versions_organization_id_deliverable_t_idx" ON "deliverable_template_versions"("organization_id", "deliverable_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_template_versions_id_organization_id_key" ON "deliverable_template_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_template_versions_deliverable_template_id_versi_key" ON "deliverable_template_versions"("deliverable_template_id", "version");

-- CreateIndex
CREATE INDEX "deliverable_template_sections_organization_id_deliverable_t_idx" ON "deliverable_template_sections"("organization_id", "deliverable_template_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_template_sections_id_organization_id_key" ON "deliverable_template_sections"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_template_sections_deliverable_template_version__key" ON "deliverable_template_sections"("deliverable_template_version_id", "code");

-- CreateIndex
CREATE INDEX "document_themes_organization_id_scope_level_idx" ON "document_themes"("organization_id", "scope_level");

-- CreateIndex
CREATE INDEX "document_themes_organization_id_client_account_id_idx" ON "document_themes"("organization_id", "client_account_id");

-- CreateIndex
CREATE INDEX "document_themes_organization_id_tender_id_idx" ON "document_themes"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_themes_id_organization_id_key" ON "document_themes"("id", "organization_id");

-- CreateIndex
CREATE INDEX "document_theme_versions_organization_id_document_theme_id_idx" ON "document_theme_versions"("organization_id", "document_theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_theme_versions_id_organization_id_key" ON "document_theme_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_theme_versions_document_theme_id_version_key" ON "document_theme_versions"("document_theme_id", "version");

-- CreateIndex
CREATE INDEX "deliverables_organization_id_tender_id_idx" ON "deliverables"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_id_organization_id_key" ON "deliverables"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_tender_id_type_key" ON "deliverables"("tender_id", "type");

-- CreateIndex
CREATE INDEX "deliverable_sections_organization_id_deliverable_id_idx" ON "deliverable_sections"("organization_id", "deliverable_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_sections_id_organization_id_key" ON "deliverable_sections"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_sections_deliverable_id_code_key" ON "deliverable_sections"("deliverable_id", "code");

-- CreateIndex
CREATE INDEX "deliverable_revisions_organization_id_deliverable_section_i_idx" ON "deliverable_revisions"("organization_id", "deliverable_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_revisions_id_organization_id_key" ON "deliverable_revisions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_revisions_deliverable_section_id_revision_numbe_key" ON "deliverable_revisions"("deliverable_section_id", "revision_number");

-- CreateIndex
CREATE INDEX "deliverable_reviews_organization_id_deliverable_revision_id_idx" ON "deliverable_reviews"("organization_id", "deliverable_revision_id");

-- CreateIndex
CREATE INDEX "deliverable_comments_organization_id_deliverable_id_idx" ON "deliverable_comments"("organization_id", "deliverable_id");

-- CreateIndex
CREATE INDEX "deliverable_comments_organization_id_deliverable_section_id_idx" ON "deliverable_comments"("organization_id", "deliverable_section_id");

-- CreateIndex
CREATE INDEX "deliverable_comments_organization_id_deliverable_revision_i_idx" ON "deliverable_comments"("organization_id", "deliverable_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_export_selections_deliverable_section_id_organi_key" ON "deliverable_export_selections"("deliverable_section_id", "organization_id");

-- CreateIndex
CREATE INDEX "compliance_matrix_entries_organization_id_deliverable_id_idx" ON "compliance_matrix_entries"("organization_id", "deliverable_id");

-- CreateIndex
CREATE INDEX "checklist_piece_entries_organization_id_deliverable_id_idx" ON "checklist_piece_entries"("organization_id", "deliverable_id");

-- CreateIndex
CREATE INDEX "deliverable_annexes_organization_id_deliverable_id_idx" ON "deliverable_annexes"("organization_id", "deliverable_id");

-- AddForeignKey
ALTER TABLE "deliverable_templates" ADD CONSTRAINT "deliverable_templates_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_templates" ADD CONSTRAINT "deliverable_templates_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_template_versions" ADD CONSTRAINT "deliverable_template_versions_deliverable_template_id_orga_fkey" FOREIGN KEY ("deliverable_template_id", "organization_id") REFERENCES "deliverable_templates"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_template_sections" ADD CONSTRAINT "deliverable_template_sections_deliverable_template_version_fkey" FOREIGN KEY ("deliverable_template_version_id", "organization_id") REFERENCES "deliverable_template_versions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_themes" ADD CONSTRAINT "document_themes_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_themes" ADD CONSTRAINT "document_themes_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_theme_versions" ADD CONSTRAINT "document_theme_versions_document_theme_id_organization_id_fkey" FOREIGN KEY ("document_theme_id", "organization_id") REFERENCES "document_themes"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_sections" ADD CONSTRAINT "deliverable_sections_deliverable_id_organization_id_fkey" FOREIGN KEY ("deliverable_id", "organization_id") REFERENCES "deliverables"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_revisions" ADD CONSTRAINT "deliverable_revisions_deliverable_section_id_organization__fkey" FOREIGN KEY ("deliverable_section_id", "organization_id") REFERENCES "deliverable_sections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_deliverable_revision_id_organization_i_fkey" FOREIGN KEY ("deliverable_revision_id", "organization_id") REFERENCES "deliverable_revisions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_comments" ADD CONSTRAINT "deliverable_comments_deliverable_id_organization_id_fkey" FOREIGN KEY ("deliverable_id", "organization_id") REFERENCES "deliverables"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_comments" ADD CONSTRAINT "deliverable_comments_deliverable_section_id_organization_i_fkey" FOREIGN KEY ("deliverable_section_id", "organization_id") REFERENCES "deliverable_sections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_comments" ADD CONSTRAINT "deliverable_comments_deliverable_revision_id_organization__fkey" FOREIGN KEY ("deliverable_revision_id", "organization_id") REFERENCES "deliverable_revisions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_export_selections" ADD CONSTRAINT "deliverable_export_selections_deliverable_section_id_organ_fkey" FOREIGN KEY ("deliverable_section_id", "organization_id") REFERENCES "deliverable_sections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_export_selections" ADD CONSTRAINT "deliverable_export_selections_deliverable_revision_id_orga_fkey" FOREIGN KEY ("deliverable_revision_id", "organization_id") REFERENCES "deliverable_revisions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_matrix_entries" ADD CONSTRAINT "compliance_matrix_entries_deliverable_id_organization_id_fkey" FOREIGN KEY ("deliverable_id", "organization_id") REFERENCES "deliverables"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_piece_entries" ADD CONSTRAINT "checklist_piece_entries_deliverable_id_organization_id_fkey" FOREIGN KEY ("deliverable_id", "organization_id") REFERENCES "deliverables"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_annexes" ADD CONSTRAINT "deliverable_annexes_deliverable_id_organization_id_fkey" FOREIGN KEY ("deliverable_id", "organization_id") REFERENCES "deliverables"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (mission Sprint 8A.1 — catalogues fermés, hand-appended, jamais un enum natif Prisma)
ALTER TABLE "deliverable_templates" ADD CONSTRAINT "deliverable_templates_scope_level_check" CHECK ("scope_level" IN ('TENDER','CLIENT','ORGANIZATION'));
ALTER TABLE "deliverable_templates" ADD CONSTRAINT "deliverable_templates_document_type_check" CHECK ("document_type" IN ('TECHNICAL_MEMO','EXECUTIVE_SUMMARY'));

ALTER TABLE "deliverable_template_versions" ADD CONSTRAINT "deliverable_template_versions_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED'));

ALTER TABLE "deliverable_template_sections" ADD CONSTRAINT "deliverable_template_sections_heading_level_check" CHECK ("heading_level" IN (1,2,3));
ALTER TABLE "deliverable_template_sections" ADD CONSTRAINT "deliverable_template_sections_requirement_check" CHECK ("requirement" IN ('MANDATORY','OPTIONAL','CONDITIONAL'));

ALTER TABLE "document_themes" ADD CONSTRAINT "document_themes_scope_level_check" CHECK ("scope_level" IN ('TENDER','CLIENT','ORGANIZATION'));

ALTER TABLE "document_theme_versions" ADD CONSTRAINT "document_theme_versions_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED'));

ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_type_check" CHECK ("type" IN ('TECHNICAL_MEMO','EXECUTIVE_SUMMARY','COMPLIANCE_MATRIX','CHECKLIST','VALIDATION_REPORT','COST_REPORT','ANNEXES','SIGNATURE_DOCUMENTS','SUBMISSION_PACKAGE'));
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_status_check" CHECK ("status" IN ('NOT_STARTED','DRAFT','IN_PROGRESS','READY_FOR_REVIEW','CHANGES_REQUESTED','VALIDATED','APPROVED','EXPORTED','BLOCKED'));
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_template_source_level_check" CHECK ("template_source_level" IS NULL OR "template_source_level" IN ('TENDER','CLIENT','ORGANIZATION'));
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_theme_source_level_check" CHECK ("theme_source_level" IS NULL OR "theme_source_level" IN ('TENDER','CLIENT','ORGANIZATION'));

ALTER TABLE "deliverable_sections" ADD CONSTRAINT "deliverable_sections_heading_level_check" CHECK ("heading_level" IN (1,2,3));
ALTER TABLE "deliverable_sections" ADD CONSTRAINT "deliverable_sections_status_check" CHECK ("status" IN ('NOT_STARTED','DRAFT','IN_PROGRESS','READY_FOR_REVIEW','CHANGES_REQUESTED','VALIDATED'));

ALTER TABLE "deliverable_revisions" ADD CONSTRAINT "deliverable_revisions_source_type_check" CHECK ("source_type" IN ('AI_GENERATED','MANUAL','RESTORED'));
ALTER TABLE "deliverable_revisions" ADD CONSTRAINT "deliverable_revisions_status_check" CHECK ("status" IN ('DRAFT','READY_FOR_REVIEW','CHANGES_REQUESTED','VALIDATED','REJECTED','ARCHIVED'));

ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_decision_check" CHECK ("decision" IN ('APPROVED','CHANGES_REQUESTED','REJECTED'));

ALTER TABLE "deliverable_comments" ADD CONSTRAINT "deliverable_comments_status_check" CHECK ("status" IN ('OPEN','RESOLVED'));

ALTER TABLE "compliance_matrix_entries" ADD CONSTRAINT "compliance_matrix_entries_criticality_check" CHECK ("criticality" IN ('LOW','MEDIUM','HIGH','CRITICAL'));
ALTER TABLE "compliance_matrix_entries" ADD CONSTRAINT "compliance_matrix_entries_coverage_status_check" CHECK ("coverage_status" IN ('COVERED','PARTIALLY_COVERED','NOT_COVERED','NOT_APPLICABLE','TO_CONFIRM'));

ALTER TABLE "checklist_piece_entries" ADD CONSTRAINT "checklist_piece_entries_status_check" CHECK ("status" IN ('MISSING','PROVIDED','EXPIRED','REJECTED','VALID'));

ALTER TABLE "deliverable_annexes" ADD CONSTRAINT "deliverable_annexes_status_check" CHECK ("status" IN ('PENDING','PROVIDED','VALIDATED'));

-- Index unique partiel : une seule version ACTIVE par template/thème (même motif que
-- export_template_versions_org_template_active_key, Sprint 8A).
CREATE UNIQUE INDEX "deliverable_template_versions_template_active_key" ON "deliverable_template_versions"("deliverable_template_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "document_theme_versions_theme_active_key" ON "document_theme_versions"("document_theme_id") WHERE "status" = 'ACTIVE';
