-- CreateTable
CREATE TABLE "export_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_type" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_template_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "export_template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "format" VARCHAR(4) NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "export_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "export_template_id" UUID NOT NULL,
    "export_template_version_id" UUID NOT NULL,
    "document_type" VARCHAR(30) NOT NULL,
    "mode" VARCHAR(7) NOT NULL,
    "format" VARCHAR(4) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "version" INTEGER NOT NULL,
    "based_on_export_job_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_code" VARCHAR(60),
    "error_message" TEXT,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_section_selections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "export_job_id" UUID NOT NULL,
    "section_id" VARCHAR(100) NOT NULL,
    "task_type" VARCHAR(40),
    "source_type" VARCHAR(10) NOT NULL,
    "generation_id" UUID,
    "pricing_estimate_version_id" UUID,
    "manual_content" TEXT,
    "validation_status" VARCHAR(14) NOT NULL,
    "selected_by" UUID NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "export_section_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "export_job_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "hash_algorithm" VARCHAR(20) NOT NULL DEFAULT 'SHA-256',
    "storage_key" VARCHAR(500) NOT NULL,
    "manifest_json" JSONB NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "export_job_id" UUID NOT NULL,
    "readiness_status" VARCHAR(20) NOT NULL,
    "run_by" UUID NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_issues" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "validation_run_id" UUID NOT NULL,
    "rule_code" VARCHAR(60) NOT NULL,
    "severity" VARCHAR(10) NOT NULL,
    "message" TEXT NOT NULL,
    "resource_type" VARCHAR(40),
    "resource_id" UUID,
    "source" VARCHAR(40),
    "recommendation" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution_status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "resolution_note" TEXT,

    CONSTRAINT "validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "export_job_id" UUID NOT NULL,
    "validation_run_id" UUID NOT NULL,
    "manifest_hash" VARCHAR(64) NOT NULL,
    "approved_by" UUID NOT NULL,
    "approver_role" VARCHAR(30) NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "previous_status" VARCHAR(20),
    "next_status" VARCHAR(20),
    "status" VARCHAR(11) NOT NULL DEFAULT 'ACTIVE',
    "invalidated_at" TIMESTAMP(3),
    "invalidated_reason" TEXT,

    CONSTRAINT "final_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "document_ref" VARCHAR(200) NOT NULL,
    "source_dce" VARCHAR(300),
    "page_or_section" VARCHAR(100),
    "mandatory" BOOLEAN NOT NULL,
    "moment_text" TEXT,
    "format" VARCHAR(40),
    "level_expected" VARCHAR(6),
    "certificate_requirement" TEXT,
    "signatory_expected" VARCHAR(200),
    "confidence" VARCHAR(6) NOT NULL DEFAULT 'MEDIUM',
    "status" VARCHAR(9) NOT NULL DEFAULT 'DETECTED',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "professional_email" VARCHAR(320) NOT NULL,
    "job_title" VARCHAR(150),
    "organization_name" VARCHAR(200),
    "authority_text" TEXT,
    "authority_document_id" UUID,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "status" VARCHAR(9) NOT NULL DEFAULT 'PENDING',
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "export_artifact_id" UUID NOT NULL,
    "provider" VARCHAR(10) NOT NULL,
    "provider_transaction_id" VARCHAR(120),
    "status" VARCHAR(13) NOT NULL DEFAULT 'PREPARING',
    "requested_level" VARCHAR(6),
    "confirmed_level" VARCHAR(6),
    "level_source" VARCHAR(40),
    "document_hash" VARCHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_code" VARCHAR(60),
    "error_message" TEXT,

    CONSTRAINT "signature_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_participants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "signature_transaction_id" UUID NOT NULL,
    "signatory_id" UUID NOT NULL,
    "provider_participant_id" VARCHAR(120),
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(8) NOT NULL DEFAULT 'PENDING',
    "invitation_redirect_url" VARCHAR(2048),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "signature_transaction_id" UUID NOT NULL,
    "kind" VARCHAR(15) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "provider_artifact_id" VARCHAR(120),
    "is_fake_test_evidence" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(13) NOT NULL DEFAULT 'PROVIDER',
    "imported_by" UUID,
    "verification_status" VARCHAR(10),
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_provider_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "provider" VARCHAR(10) NOT NULL,
    "provider_event_id" VARCHAR(120),
    "provider_transaction_id" VARCHAR(120),
    "event_type" VARCHAR(60) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" VARCHAR(9) NOT NULL DEFAULT 'RECEIVED',
    "payload_hash" VARCHAR(64) NOT NULL,
    "signature_verified" BOOLEAN NOT NULL,
    "error_code" VARCHAR(60),
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "signature_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_packages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "validation_run_id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "readiness_status" VARCHAR(20) NOT NULL,
    "file_name" VARCHAR(255),
    "mime_type" VARCHAR(60),
    "file_size" INTEGER,
    "file_hash" VARCHAR(64),
    "storage_key" VARCHAR(500),
    "manifest_json" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_code" VARCHAR(60),
    "error_message" TEXT,

    CONSTRAINT "submission_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "submission_package_id" UUID NOT NULL,
    "archive_path" VARCHAR(300) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "source_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "package_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "export_templates_id_organization_id_key" ON "export_templates"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_templates_organization_id_document_type_name_key" ON "export_templates"("organization_id", "document_type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "export_template_versions_id_organization_id_key" ON "export_template_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_template_versions_organization_id_export_template_id_key" ON "export_template_versions"("organization_id", "export_template_id", "version");

-- CreateIndex
CREATE INDEX "export_jobs_organization_id_tender_id_idx" ON "export_jobs"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_jobs_id_organization_id_key" ON "export_jobs"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_jobs_tender_id_document_type_format_version_key" ON "export_jobs"("tender_id", "document_type", "format", "version");

-- CreateIndex
CREATE INDEX "export_section_selections_organization_id_export_job_id_idx" ON "export_section_selections"("organization_id", "export_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_section_selections_export_job_id_section_id_key" ON "export_section_selections"("export_job_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_artifacts_id_organization_id_key" ON "export_artifacts"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_artifacts_export_job_id_organization_id_key" ON "export_artifacts"("export_job_id", "organization_id");

-- CreateIndex
CREATE INDEX "validation_runs_organization_id_tender_id_idx" ON "validation_runs"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "validation_runs_id_organization_id_key" ON "validation_runs"("id", "organization_id");

-- CreateIndex
CREATE INDEX "validation_issues_organization_id_validation_run_id_idx" ON "validation_issues"("organization_id", "validation_run_id");

-- CreateIndex
CREATE INDEX "final_approvals_organization_id_tender_id_idx" ON "final_approvals"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "final_approvals_id_organization_id_key" ON "final_approvals"("id", "organization_id");

-- CreateIndex
CREATE INDEX "signature_requirements_organization_id_tender_id_idx" ON "signature_requirements"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requirements_id_organization_id_key" ON "signature_requirements"("id", "organization_id");

-- CreateIndex
CREATE INDEX "signatories_organization_id_tender_id_idx" ON "signatories"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "signatories_id_organization_id_key" ON "signatories"("id", "organization_id");

-- CreateIndex
CREATE INDEX "signature_transactions_organization_id_tender_id_idx" ON "signature_transactions"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_transactions_id_organization_id_key" ON "signature_transactions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_transactions_provider_provider_transaction_id_key" ON "signature_transactions"("provider", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "signature_participants_organization_id_signature_transactio_idx" ON "signature_participants"("organization_id", "signature_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_participants_signature_transaction_id_signatory_i_key" ON "signature_participants"("signature_transaction_id", "signatory_id");

-- CreateIndex
CREATE INDEX "signature_artifacts_organization_id_signature_transaction_i_idx" ON "signature_artifacts"("organization_id", "signature_transaction_id");

-- CreateIndex
CREATE INDEX "signature_provider_events_organization_id_provider_transact_idx" ON "signature_provider_events"("organization_id", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_provider_events_provider_provider_event_id_key" ON "signature_provider_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "submission_packages_organization_id_tender_id_idx" ON "submission_packages"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_packages_id_organization_id_key" ON "submission_packages"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_packages_tender_id_version_key" ON "submission_packages"("tender_id", "version");

-- CreateIndex
CREATE INDEX "package_files_organization_id_submission_package_id_idx" ON "package_files"("organization_id", "submission_package_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_files_submission_package_id_archive_path_key" ON "package_files"("submission_package_id", "archive_path");

-- AddForeignKey
ALTER TABLE "export_template_versions" ADD CONSTRAINT "export_template_versions_export_template_id_organization_i_fkey" FOREIGN KEY ("export_template_id", "organization_id") REFERENCES "export_templates"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_export_template_version_id_organization_id_fkey" FOREIGN KEY ("export_template_version_id", "organization_id") REFERENCES "export_template_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_based_on_export_job_id_fkey" FOREIGN KEY ("based_on_export_job_id") REFERENCES "export_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_section_selections" ADD CONSTRAINT "export_section_selections_export_job_id_organization_id_fkey" FOREIGN KEY ("export_job_id", "organization_id") REFERENCES "export_jobs"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_artifacts" ADD CONSTRAINT "export_artifacts_export_job_id_organization_id_fkey" FOREIGN KEY ("export_job_id", "organization_id") REFERENCES "export_jobs"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_export_job_id_organization_id_fkey" FOREIGN KEY ("export_job_id", "organization_id") REFERENCES "export_jobs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_validation_run_id_organization_id_fkey" FOREIGN KEY ("validation_run_id", "organization_id") REFERENCES "validation_runs"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_approvals" ADD CONSTRAINT "final_approvals_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_approvals" ADD CONSTRAINT "final_approvals_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_approvals" ADD CONSTRAINT "final_approvals_export_job_id_organization_id_fkey" FOREIGN KEY ("export_job_id", "organization_id") REFERENCES "export_jobs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_approvals" ADD CONSTRAINT "final_approvals_validation_run_id_organization_id_fkey" FOREIGN KEY ("validation_run_id", "organization_id") REFERENCES "validation_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requirements" ADD CONSTRAINT "signature_requirements_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requirements" ADD CONSTRAINT "signature_requirements_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_export_artifact_id_organization_id_fkey" FOREIGN KEY ("export_artifact_id", "organization_id") REFERENCES "export_artifacts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_participants" ADD CONSTRAINT "signature_participants_signature_transaction_id_organizati_fkey" FOREIGN KEY ("signature_transaction_id", "organization_id") REFERENCES "signature_transactions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_participants" ADD CONSTRAINT "signature_participants_signatory_id_organization_id_fkey" FOREIGN KEY ("signatory_id", "organization_id") REFERENCES "signatories"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_signature_transaction_id_organization__fkey" FOREIGN KEY ("signature_transaction_id", "organization_id") REFERENCES "signature_transactions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_packages" ADD CONSTRAINT "submission_packages_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_packages" ADD CONSTRAINT "submission_packages_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_packages" ADD CONSTRAINT "submission_packages_validation_run_id_organization_id_fkey" FOREIGN KEY ("validation_run_id", "organization_id") REFERENCES "validation_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_packages" ADD CONSTRAINT "submission_packages_approval_id_organization_id_fkey" FOREIGN KEY ("approval_id", "organization_id") REFERENCES "final_approvals"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_files" ADD CONSTRAINT "package_files_submission_package_id_organization_id_fkey" FOREIGN KEY ("submission_package_id", "organization_id") REFERENCES "submission_packages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (Sprint 8A/8A bis — mêmes motifs que les CHECK ajoutées à la main pour
-- Generation/Pricing : Prisma n'exprime pas nativement les enums fermés sur une colonne VARCHAR,
-- la contrainte réelle est donc ajoutée ici, jamais laissée à la seule discipline applicative).
ALTER TABLE "export_templates" ADD CONSTRAINT "export_templates_document_type_check" CHECK ("document_type" IN ('TECHNICAL_MEMO','EXECUTIVE_SUMMARY','COMPLIANCE_MATRIX','CHECKLIST','VALIDATION_REPORT','COST_REPORT','SIGNATURE_PACKAGE'));

ALTER TABLE "export_template_versions" ADD CONSTRAINT "export_template_versions_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED'));
ALTER TABLE "export_template_versions" ADD CONSTRAINT "export_template_versions_format_check" CHECK ("format" IN ('DOCX','PDF'));

ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_document_type_check" CHECK ("document_type" IN ('TECHNICAL_MEMO','EXECUTIVE_SUMMARY','COMPLIANCE_MATRIX','CHECKLIST','VALIDATION_REPORT','COST_REPORT','SIGNATURE_PACKAGE'));
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_mode_check" CHECK ("mode" IN ('PREVIEW','FINAL'));
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_format_check" CHECK ("format" IN ('DOCX','PDF'));
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_status_check" CHECK ("status" IN ('PENDING','GENERATING','COMPLETED','FAILED'));

ALTER TABLE "export_section_selections" ADD CONSTRAINT "export_section_selections_source_type_check" CHECK ("source_type" IN ('GENERATION','PRICING','MANUAL','ANNEX'));
ALTER TABLE "export_section_selections" ADD CONSTRAINT "export_section_selections_validation_status_check" CHECK ("validation_status" IN ('VALIDATED','NOT_VALIDATED','UNKNOWN'));

ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_readiness_status_check" CHECK ("readiness_status" IN ('NOT_READY','READY_WITH_WARNINGS','READY_FOR_APPROVAL','BLOCKED'));

ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_severity_check" CHECK ("severity" IN ('BLOCKING','WARNING'));
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_resolution_status_check" CHECK ("resolution_status" IN ('OPEN','RESOLVED','REOPENED'));

ALTER TABLE "final_approvals" ADD CONSTRAINT "final_approvals_status_check" CHECK ("status" IN ('ACTIVE','INVALIDATED'));

ALTER TABLE "signature_requirements" ADD CONSTRAINT "signature_requirements_level_expected_check" CHECK ("level_expected" IS NULL OR "level_expected" IN ('LEVEL0','LEVEL1','LEVEL2','LEVEL3','LEVEL4'));
ALTER TABLE "signature_requirements" ADD CONSTRAINT "signature_requirements_confidence_check" CHECK ("confidence" IN ('LOW','MEDIUM','HIGH'));
ALTER TABLE "signature_requirements" ADD CONSTRAINT "signature_requirements_status_check" CHECK ("status" IN ('DETECTED','CONFIRMED','REJECTED','UNKNOWN'));

ALTER TABLE "signatories" ADD CONSTRAINT "signatories_status_check" CHECK ("status" IN ('PENDING','VERIFIED','REJECTED'));

ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_provider_check" CHECK ("provider" IN ('FAKE','UNIVERSIGN'));
ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_status_check" CHECK ("status" IN ('PREPARING','READY_TO_SEND','SENT','IN_PROGRESS','SIGNED','VERIFIED','DECLINED','CANCELLED','EXPIRED','FAILED','INVALID'));
ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_requested_level_check" CHECK ("requested_level" IS NULL OR "requested_level" IN ('LEVEL0','LEVEL1','LEVEL2','LEVEL3','LEVEL4'));
ALTER TABLE "signature_transactions" ADD CONSTRAINT "signature_transactions_confirmed_level_check" CHECK ("confirmed_level" IS NULL OR "confirmed_level" IN ('LEVEL0','LEVEL1','LEVEL2','LEVEL3','LEVEL4'));

ALTER TABLE "signature_participants" ADD CONSTRAINT "signature_participants_status_check" CHECK ("status" IN ('PENDING','SENT','OPENED','SIGNED','DECLINED'));

ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_kind_check" CHECK ("kind" IN ('SIGNED_DOCUMENT','PROOF'));
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_source_check" CHECK ("source" IN ('PROVIDER','MANUAL_IMPORT'));
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_verification_status_check" CHECK ("verification_status" IS NULL OR "verification_status" IN ('IMPORTED','TO_VERIFY','VERIFIED','INVALID','REJECTED'));

ALTER TABLE "signature_provider_events" ADD CONSTRAINT "signature_provider_events_status_check" CHECK ("status" IN ('RECEIVED','PROCESSED','REJECTED','IGNORED'));

ALTER TABLE "submission_packages" ADD CONSTRAINT "submission_packages_status_check" CHECK ("status" IN ('PENDING','GENERATING','COMPLETED','FAILED'));

ALTER TABLE "package_files" ADD CONSTRAINT "package_files_source_type_check" CHECK ("source_type" IN ('EXPORT_ARTIFACT','SIGNATURE_ARTIFACT','MANIFEST'));

-- PartialUniqueIndex (Sprint 6 precedent — prompt_versions_org_template_active_key) : une seule
-- version ACTIVE par (organization_id, export_template_id), non exprimable en DSL Prisma.
CREATE UNIQUE INDEX "export_template_versions_org_template_active_key" ON "export_template_versions"("organization_id", "export_template_id") WHERE "status" = 'ACTIVE';

