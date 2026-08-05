-- CreateTable
CREATE TABLE "administrative_dossiers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'INCOMPLETE',
    "completion_percentage" INTEGER NOT NULL DEFAULT 0,
    "validation_status" VARCHAR(14) NOT NULL DEFAULT 'NOT_VALIDATED',
    "last_validated_by" UUID,
    "last_validated_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_dossiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "source_document_id" UUID,
    "source_document_version" INTEGER,
    "source_location" TEXT,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "requirement_type" VARCHAR(40) NOT NULL,
    "expected_document_type" VARCHAR(40) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "due_date" TIMESTAMP(3),
    "validity_rule" TEXT,
    "signature_required" BOOLEAN NOT NULL DEFAULT false,
    "original_text_reference" TEXT,
    "confidence" DOUBLE PRECISION,
    "origin" VARCHAR(20) NOT NULL,
    "created_by" UUID NOT NULL,
    "validated_by" UUID,
    "validation_status" VARCHAR(14) NOT NULL DEFAULT 'SUGGESTED',
    "matched_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "administrative_dossier_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "requirement_id" UUID,
    "validated_revision_id" UUID,
    "validated_at" TIMESTAMP(3),
    "validated_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_document_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "administrative_document_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "document_id" UUID,
    "document_version_id" UUID,
    "document_checksum" VARCHAR(128),
    "document_file_name" VARCHAR(300),
    "document_mime_type" VARCHAR(120),
    "expires_at" TIMESTAMP(3),
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dossiers_id_organization_id_key" ON "administrative_dossiers"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dossiers_organization_id_tender_id_key" ON "administrative_dossiers"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_requirements_id_organization_id_key" ON "administrative_requirements"("id", "organization_id");

-- CreateIndex
CREATE INDEX "administrative_requirements_organization_id_tender_id_idx" ON "administrative_requirements"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_documents_id_organization_id_key" ON "administrative_documents"("id", "organization_id");

-- CreateIndex
CREATE INDEX "administrative_documents_organization_id_administrative_do_idx" ON "administrative_documents"("organization_id", "administrative_dossier_id");

-- CreateIndex
CREATE INDEX "administrative_documents_organization_id_tender_id_idx" ON "administrative_documents"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_document_revisions_id_organization_id_key" ON "administrative_document_revisions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_document_revisions_administrative_document__key" ON "administrative_document_revisions"("administrative_document_id", "revision_number");

-- CreateIndex
CREATE INDEX "administrative_document_revisions_organization_id_administ_idx" ON "administrative_document_revisions"("organization_id", "administrative_document_id");

-- AddForeignKey
ALTER TABLE "administrative_dossiers" ADD CONSTRAINT "administrative_dossiers_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dossiers" ADD CONSTRAINT "administrative_dossiers_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_requirements" ADD CONSTRAINT "administrative_requirements_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_administrative_dossier_id_organiz_fkey" FOREIGN KEY ("administrative_dossier_id", "organization_id") REFERENCES "administrative_dossiers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_document_revisions" ADD CONSTRAINT "administrative_document_revisions_administrative_document__fkey" FOREIGN KEY ("administrative_document_id", "organization_id") REFERENCES "administrative_documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (mission Sprint 8C — catalogues fermés, hand-appended, jamais un enum natif Prisma)
ALTER TABLE "administrative_dossiers" ADD CONSTRAINT "administrative_dossiers_status_check" CHECK ("status" IN ('INCOMPLETE','TO_COMPLETE','IN_VERIFICATION','READY','BLOCKED'));
ALTER TABLE "administrative_dossiers" ADD CONSTRAINT "administrative_dossiers_validation_status_check" CHECK ("validation_status" IN ('NOT_VALIDATED','VALIDATED','OUTDATED'));

ALTER TABLE "administrative_requirements" ADD CONSTRAINT "administrative_requirements_expected_document_type_check" CHECK ("expected_document_type" IN ('DC1','DC2','DC4','DUME','ACTE_ENGAGEMENT','K_BIS_OR_EQUIVALENT','ATTESTATION_FISCALE','ATTESTATION_SOCIALE','ATTESTATION_ASSURANCE','POUVOIR_SIGNATURE','DELEGATION_SIGNATURE','RIB','CERTIFICAT_QUALIFICATION','REFERENCES_PROFESSIONNELLES','CAPACITES_TECHNIQUES','CAPACITES_FINANCIERES','DECLARATION_CHIFFRE_AFFAIRES','LISTE_MOYENS_HUMAINS','LISTE_MOYENS_TECHNIQUES','DOCUMENT_GROUPEMENT','DOCUMENT_SOUS_TRAITANCE','DOCUMENT_ACHETEUR_SPECIFIQUE','OTHER'));
ALTER TABLE "administrative_requirements" ADD CONSTRAINT "administrative_requirements_origin_check" CHECK ("origin" IN ('MANUAL','DCE_ANALYSIS','BUYER_TEMPLATE','TENDEROS_RULE'));
ALTER TABLE "administrative_requirements" ADD CONSTRAINT "administrative_requirements_validation_status_check" CHECK ("validation_status" IN ('SUGGESTED','CONFIRMED','REJECTED','NOT_APPLICABLE'));

ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_document_type_check" CHECK ("document_type" IN ('DC1','DC2','DC4','DUME','ACTE_ENGAGEMENT','K_BIS_OR_EQUIVALENT','ATTESTATION_FISCALE','ATTESTATION_SOCIALE','ATTESTATION_ASSURANCE','POUVOIR_SIGNATURE','DELEGATION_SIGNATURE','RIB','CERTIFICAT_QUALIFICATION','REFERENCES_PROFESSIONNELLES','CAPACITES_TECHNIQUES','CAPACITES_FINANCIERES','DECLARATION_CHIFFRE_AFFAIRES','LISTE_MOYENS_HUMAINS','LISTE_MOYENS_TECHNIQUES','DOCUMENT_GROUPEMENT','DOCUMENT_SOUS_TRAITANCE','DOCUMENT_ACHETEUR_SPECIFIQUE','OTHER'));

ALTER TABLE "administrative_document_revisions" ADD CONSTRAINT "administrative_document_revisions_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','VALIDATED','REJECTED','REPLACED','ARCHIVED'));
