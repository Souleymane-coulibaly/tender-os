-- V2 Sprint 2 — Entreprise candidate (satellites additifs de ClientAccount) et répertoire
-- organisationnel de sous-traitants. Migration additive : jamais une ancienne migration modifiée,
-- aucune table/colonne supprimée, ClientAccount inchangé.

-- AlterTable — relation FUTURE nullable (mission §6), non exploitée ce sprint.
ALTER TABLE "administrative_subcontractor_declarations" ADD COLUMN "subcontractor_profile_id" UUID;

-- CreateTable
CREATE TABLE "company_legal_identities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "legal_name" VARCHAR(240),
    "trade_name" VARCHAR(240),
    "siren" VARCHAR(9),
    "siret_principal" VARCHAR(14),
    "vat_number" VARCHAR(20),
    "legal_form" VARCHAR(120),
    "share_capital_amount" DECIMAL(14,2),
    "share_capital_currency" VARCHAR(3),
    "ape_code" VARCHAR(10),
    "incorporated_at" TIMESTAMP(3),
    "rcs_number" VARCHAR(40),
    "rcs_city" VARCHAR(120),
    "registration_country" VARCHAR(10),
    "address_line" VARCHAR(300),
    "address_complement" VARCHAR(300),
    "postal_code" VARCHAR(20),
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "country" VARCHAR(10),
    "phone" VARCHAR(40),
    "general_email" VARCHAR(320),
    "website" VARCHAR(2048),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "last_validated_at" TIMESTAMP(3),
    "last_validated_by_user_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_legal_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_representatives" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "job_title" VARCHAR(200),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "signature_scope" TEXT,
    "signature_limitations" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_representatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_bank_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "account_holder" VARCHAR(240) NOT NULL,
    "bank_name" VARCHAR(200),
    "iban" VARCHAR(34) NOT NULL,
    "bic" VARCHAR(11),
    "country" VARCHAR(10),
    "currency" VARCHAR(3),
    "document_id" UUID,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "validated_at" TIMESTAMP(3),
    "validated_by_user_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_insurances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "other_type_label" VARCHAR(200),
    "insurer" VARCHAR(200),
    "policy_number" VARCHAR(100),
    "start_date" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "coverage_scope" TEXT,
    "coverage_amount" DECIMAL(14,2),
    "coverage_currency" VARCHAR(3),
    "document_id" UUID,
    "last_verified_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_certifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "issuer" VARCHAR(200),
    "number" VARCHAR(100),
    "type" VARCHAR(100),
    "scope" VARCHAR(300),
    "obtained_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "document_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_references" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "project_name" VARCHAR(300) NOT NULL,
    "reference_client_name" VARCHAR(240),
    "sector" VARCHAR(120),
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "amount_value" DECIMAL(14,2),
    "amount_currency" VARCHAR(3),
    "company_role" VARCHAR(200),
    "lots_or_services" TEXT,
    "skills_or_technologies" TEXT,
    "results" TEXT,
    "contact_name" VARCHAR(200),
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(40),
    "confidentiality" VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_reference_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_reference_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_reference_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_human_resources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "qualification" VARCHAR(200),
    "average_experience_years" INTEGER,
    "skills" TEXT,
    "certifications" TEXT,
    "availability_note" VARCHAR(300),
    "location" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_human_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_material_resources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "characteristics" TEXT,
    "location" VARCHAR(200),
    "availability_status" VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    "ownership_type" VARCHAR(20),
    "document_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_material_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_client_account_associations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_client_account_associations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_name" VARCHAR(240) NOT NULL,
    "trade_name" VARCHAR(240),
    "siren" VARCHAR(9),
    "siret" VARCHAR(14),
    "vat_number" VARCHAR(20),
    "legal_form" VARCHAR(120),
    "ape_code" VARCHAR(10),
    "address_line" VARCHAR(300),
    "postal_code" VARCHAR(20),
    "city" VARCHAR(120),
    "country" VARCHAR(10),
    "legal_representative_name" VARCHAR(200),
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(40),
    "skills" TEXT,
    "domains" TEXT,
    "human_resources_summary" TEXT,
    "material_resources_summary" TEXT,
    "bank_account_holder" VARCHAR(240),
    "iban" VARCHAR(34),
    "bic" VARCHAR(11),
    "bank_document_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'TO_VERIFY',
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_references" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subcontractor_profile_id" UUID NOT NULL,
    "project_name" VARCHAR(300) NOT NULL,
    "client_name" VARCHAR(240),
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_certifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subcontractor_profile_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "issuer" VARCHAR(200),
    "number" VARCHAR(100),
    "obtained_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "document_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_insurances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subcontractor_profile_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "insurer" VARCHAR(200),
    "policy_number" VARCHAR(100),
    "expires_at" TIMESTAMP(3),
    "document_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_profile_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subcontractor_profile_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_profile_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_legal_identities_organization_id_siret_principal_idx" ON "company_legal_identities"("organization_id", "siret_principal");
CREATE UNIQUE INDEX "company_legal_identities_id_organization_id_key" ON "company_legal_identities"("id", "organization_id");
CREATE UNIQUE INDEX "company_legal_identities_client_account_id_organization_id_key" ON "company_legal_identities"("client_account_id", "organization_id");

CREATE INDEX "company_representatives_organization_id_client_account_id_idx" ON "company_representatives"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_representatives_id_organization_id_key" ON "company_representatives"("id", "organization_id");

CREATE INDEX "company_bank_accounts_organization_id_client_account_id_idx" ON "company_bank_accounts"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_bank_accounts_id_organization_id_key" ON "company_bank_accounts"("id", "organization_id");

CREATE INDEX "company_insurances_organization_id_client_account_id_idx" ON "company_insurances"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_insurances_id_organization_id_key" ON "company_insurances"("id", "organization_id");

CREATE INDEX "company_certifications_organization_id_client_account_id_idx" ON "company_certifications"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_certifications_id_organization_id_key" ON "company_certifications"("id", "organization_id");

CREATE INDEX "company_references_organization_id_client_account_id_idx" ON "company_references"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_references_id_organization_id_key" ON "company_references"("id", "organization_id");

CREATE INDEX "company_reference_documents_organization_id_company_referen_idx" ON "company_reference_documents"("organization_id", "company_reference_id");
CREATE UNIQUE INDEX "company_reference_documents_company_reference_id_document_i_key" ON "company_reference_documents"("company_reference_id", "document_id");

CREATE INDEX "company_human_resources_organization_id_client_account_id_idx" ON "company_human_resources"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_human_resources_id_organization_id_key" ON "company_human_resources"("id", "organization_id");

CREATE INDEX "company_material_resources_organization_id_client_account_i_idx" ON "company_material_resources"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "company_material_resources_id_organization_id_key" ON "company_material_resources"("id", "organization_id");

CREATE INDEX "document_client_account_associations_organization_id_client_idx" ON "document_client_account_associations"("organization_id", "client_account_id");
CREATE INDEX "document_client_account_associations_organization_id_docume_idx" ON "document_client_account_associations"("organization_id", "document_id");
CREATE UNIQUE INDEX "document_client_account_associations_document_id_client_acc_key" ON "document_client_account_associations"("document_id", "client_account_id");

CREATE INDEX "subcontractor_profiles_organization_id_status_idx" ON "subcontractor_profiles"("organization_id", "status");
CREATE UNIQUE INDEX "subcontractor_profiles_id_organization_id_key" ON "subcontractor_profiles"("id", "organization_id");

CREATE INDEX "subcontractor_references_organization_id_subcontractor_prof_idx" ON "subcontractor_references"("organization_id", "subcontractor_profile_id");
CREATE UNIQUE INDEX "subcontractor_references_id_organization_id_key" ON "subcontractor_references"("id", "organization_id");

CREATE INDEX "subcontractor_certifications_organization_id_subcontractor__idx" ON "subcontractor_certifications"("organization_id", "subcontractor_profile_id");
CREATE UNIQUE INDEX "subcontractor_certifications_id_organization_id_key" ON "subcontractor_certifications"("id", "organization_id");

CREATE INDEX "subcontractor_insurances_organization_id_subcontractor_prof_idx" ON "subcontractor_insurances"("organization_id", "subcontractor_profile_id");
CREATE UNIQUE INDEX "subcontractor_insurances_id_organization_id_key" ON "subcontractor_insurances"("id", "organization_id");

CREATE INDEX "subcontractor_profile_documents_organization_id_subcontract_idx" ON "subcontractor_profile_documents"("organization_id", "subcontractor_profile_id");
CREATE UNIQUE INDEX "subcontractor_profile_documents_document_id_subcontractor_p_key" ON "subcontractor_profile_documents"("document_id", "subcontractor_profile_id");

-- AddForeignKey
ALTER TABLE "company_legal_identities" ADD CONSTRAINT "company_legal_identities_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_representatives" ADD CONSTRAINT "company_representatives_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_bank_accounts" ADD CONSTRAINT "company_bank_accounts_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_insurances" ADD CONSTRAINT "company_insurances_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_certifications" ADD CONSTRAINT "company_certifications_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_references" ADD CONSTRAINT "company_references_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_reference_documents" ADD CONSTRAINT "company_reference_documents_company_reference_id_organizat_fkey" FOREIGN KEY ("company_reference_id", "organization_id") REFERENCES "company_references"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_human_resources" ADD CONSTRAINT "company_human_resources_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_client_account_id_organization__fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_client_account_associations" ADD CONSTRAINT "document_client_account_associations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_client_account_associations" ADD CONSTRAINT "document_client_account_associations_client_account_id_org_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subcontractor_references" ADD CONSTRAINT "subcontractor_references_subcontractor_profile_id_organiza_fkey" FOREIGN KEY ("subcontractor_profile_id", "organization_id") REFERENCES "subcontractor_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subcontractor_certifications" ADD CONSTRAINT "subcontractor_certifications_subcontractor_profile_id_orga_fkey" FOREIGN KEY ("subcontractor_profile_id", "organization_id") REFERENCES "subcontractor_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subcontractor_insurances" ADD CONSTRAINT "subcontractor_insurances_subcontractor_profile_id_organiza_fkey" FOREIGN KEY ("subcontractor_profile_id", "organization_id") REFERENCES "subcontractor_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subcontractor_profile_documents" ADD CONSTRAINT "subcontractor_profile_documents_subcontractor_profile_id_o_fkey" FOREIGN KEY ("subcontractor_profile_id", "organization_id") REFERENCES "subcontractor_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (catalogues fermés — hand-appended, jamais un enum natif Prisma)
ALTER TABLE "company_legal_identities" ADD CONSTRAINT "company_legal_identities_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "company_representatives" ADD CONSTRAINT "company_representatives_type_check" CHECK ("type" IN ('LEGAL_REPRESENTATIVE','SIGNATORY','ADMINISTRATIVE_CONTACT','COMMERCIAL_CONTACT','TECHNICAL_CONTACT'));
ALTER TABLE "company_representatives" ADD CONSTRAINT "company_representatives_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "company_bank_accounts" ADD CONSTRAINT "company_bank_accounts_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "company_insurances" ADD CONSTRAINT "company_insurances_type_check" CHECK ("type" IN ('PROFESSIONAL_LIABILITY','DECENNIAL','OPERATING_LIABILITY','SECTOR_SPECIFIC','OTHER'));
ALTER TABLE "company_insurances" ADD CONSTRAINT "company_insurances_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "company_certifications" ADD CONSTRAINT "company_certifications_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "company_references" ADD CONSTRAINT "company_references_confidentiality_check" CHECK ("confidentiality" IN ('STANDARD','CONFIDENTIAL'));
ALTER TABLE "company_references" ADD CONSTRAINT "company_references_status_check" CHECK ("status" IN ('DRAFT','VALIDATED','ARCHIVED'));

ALTER TABLE "company_human_resources" ADD CONSTRAINT "company_human_resources_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_availability_status_check" CHECK ("availability_status" IN ('AVAILABLE','IN_USE','UNAVAILABLE'));
ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_ownership_type_check" CHECK ("ownership_type" IS NULL OR "ownership_type" IN ('OWNED','LEASED'));
ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'));

ALTER TABLE "document_client_account_associations" ADD CONSTRAINT "document_client_account_associations_category_check" CHECK ("category" IN ('KBIS','TAX_CERTIFICATE','SOCIAL_CERTIFICATE','ARTICLES_OF_ASSOCIATION','OTHER'));

ALTER TABLE "subcontractor_profiles" ADD CONSTRAINT "subcontractor_profiles_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE','ARCHIVED','TO_VERIFY'));

ALTER TABLE "subcontractor_profile_documents" ADD CONSTRAINT "subcontractor_profile_documents_category_check" CHECK ("category" IN ('KBIS','TAX_CERTIFICATE','SOCIAL_CERTIFICATE','INSURANCE','CERTIFICATION','BANK_DETAILS','REFERENCE','OTHER'));
