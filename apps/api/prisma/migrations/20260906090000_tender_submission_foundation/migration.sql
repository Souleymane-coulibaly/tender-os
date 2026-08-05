-- Sprint 9 — dépôt manuel assisté et suivi de soumission (TenderSubmission/SubmissionProof).
-- Migration additive : jamais une ancienne migration modifiée.

-- CreateTable
CREATE TABLE "tender_submissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,

    "package_id" UUID NOT NULL,
    "package_version" INTEGER NOT NULL,
    "package_hash" VARCHAR(64) NOT NULL,
    "manifest_hash" VARCHAR(64),

    "status" VARCHAR(24) NOT NULL,

    "submitted_by_user_id" UUID,
    "submitted_at" TIMESTAMP(3),

    "platform" VARCHAR(30) NOT NULL,
    "custom_platform_name" VARCHAR(200),

    "platform_reference" VARCHAR(300),
    "receipt_reference" VARCHAR(300),
    "notes" TEXT,

    "supersedes_submission_id" UUID,
    "replaced_by_submission_id" UUID,

    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_user_id" UUID,
    "withdrawal_reason" TEXT,

    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "cancellation_reason" TEXT,

    "rejection_category" VARCHAR(30),
    "rejection_description" TEXT,

    "receipt_confirmed_at" TIMESTAMP(3),
    "receipt_confirmed_by_user_id" UUID,

    "external_submission_url" VARCHAR(500),

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_proofs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    "submission_id" UUID NOT NULL,

    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,

    "proof_type" VARCHAR(30) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,

    "uploaded_by_user_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tender_submissions_id_organization_id_key" ON "tender_submissions"("id", "organization_id");

-- CreateIndex
CREATE INDEX "tender_submissions_organization_id_tender_id_idx" ON "tender_submissions"("organization_id", "tender_id");

-- CreateIndex
CREATE INDEX "tender_submissions_organization_id_status_idx" ON "tender_submissions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tender_submissions_submitted_at_idx" ON "tender_submissions"("submitted_at");

-- CreateIndex
CREATE INDEX "tender_submissions_package_id_idx" ON "tender_submissions"("package_id");

-- CreateIndex
CREATE INDEX "tender_submissions_supersedes_submission_id_idx" ON "tender_submissions"("supersedes_submission_id");

-- CreateIndex
CREATE INDEX "tender_submissions_replaced_by_submission_id_idx" ON "tender_submissions"("replaced_by_submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_proofs_id_organization_id_key" ON "submission_proofs"("id", "organization_id");

-- CreateIndex
CREATE INDEX "submission_proofs_organization_id_submission_id_idx" ON "submission_proofs"("organization_id", "submission_id");

-- AddForeignKey
ALTER TABLE "tender_submissions" ADD CONSTRAINT "tender_submissions_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_proofs" ADD CONSTRAINT "submission_proofs_submission_id_organization_id_fkey" FOREIGN KEY ("submission_id", "organization_id") REFERENCES "tender_submissions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (catalogues fermés — hand-appended, jamais un enum natif Prisma)
ALTER TABLE "tender_submissions" ADD CONSTRAINT "tender_submissions_status_check" CHECK ("status" IN ('SUBMISSION_IN_PROGRESS','SUBMITTED','RECEIPT_CONFIRMED','SUBMISSION_REJECTED','WITHDRAWN','REPLACED','CANCELLED'));
ALTER TABLE "tender_submissions" ADD CONSTRAINT "tender_submissions_platform_check" CHECK ("platform" IN ('PLACE','AWS_ACHAT','MARCHES_SECURISES','MAXIMILIEN','ACHATPUBLIC','MEGALIS','E_MARCHES_PUBLICS','PLATEFORME_ACHETEUR','OTHER'));
ALTER TABLE "tender_submissions" ADD CONSTRAINT "tender_submissions_rejection_category_check" CHECK ("rejection_category" IS NULL OR "rejection_category" IN ('FILE_REJECTED','SIZE_EXCEEDED','INVALID_FORMAT','ANTIVIRUS','SIGNATURE_REJECTED','SESSION_EXPIRED','OTHER'));
ALTER TABLE "submission_proofs" ADD CONSTRAINT "submission_proofs_proof_type_check" CHECK ("proof_type" IN ('RECEIPT','ACKNOWLEDGEMENT','SCREENSHOT','PLATFORM_CONFIRMATION','OTHER'));

-- Une seule soumission "en vol" (non terminale/historique) par Tender — mission §31/§32, filet de
-- sécurité DB ; l'atomicité applicative (remplacement/retrait dans une même transaction) reste la
-- première ligne de défense, même motif que official_administrative_templates_*_key (Sprint 8C.1).
CREATE UNIQUE INDEX "tender_submissions_one_in_flight_per_tender_key" ON "tender_submissions" ("tender_id") WHERE "status" IN ('SUBMISSION_IN_PROGRESS','SUBMITTED','RECEIPT_CONFIRMED');
