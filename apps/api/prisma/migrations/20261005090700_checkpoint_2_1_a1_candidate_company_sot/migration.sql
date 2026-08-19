-- TenderOS 2.1 — Checkpoint 2.1-A1 (CandidateCompany Source-of-Truth)
-- Introduit CandidateCompany + CandidateEstablishment, distinct de ClientAccount (portefeuille
-- commercial, non touché). Strictement additive : aucune table/colonne existante supprimée ou
-- renommée, aucun NOT NULL ajouté sans backfill, aucun dual-write. `source_client_account_id` est un
-- champ de compatibilité de migration (traçabilité/idempotence du backfill A2), jamais une source de
-- vérité métier — pas de contrainte FOREIGN KEY déclarée vers client_accounts (même discipline que
-- routing_decisions.analysis_id/generation_id : un pointeur indexé, pas un couplage structurel).

-- CreateTable
CREATE TABLE "candidate_companies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_normalized" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(240),
    "siren" VARCHAR(9),
    "vat_number" VARCHAR(20),
    "legal_form" VARCHAR(120),
    "status" VARCHAR(20) NOT NULL,
    "source_client_account_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_establishments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_company_id" UUID NOT NULL,
    "siret" VARCHAR(14) NOT NULL,
    "label" VARCHAR(200),
    "is_principal" BOOLEAN NOT NULL DEFAULT false,
    "address_line" VARCHAR(300),
    "postal_code" VARCHAR(20),
    "city" VARCHAR(120),
    "country" VARCHAR(10),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_establishments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_companies_id_organization_id_key" ON "candidate_companies"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_companies_organization_id_name_normalized_key" ON "candidate_companies"("organization_id", "name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_companies_organization_id_source_client_account__key" ON "candidate_companies"("organization_id", "source_client_account_id");

-- CreateIndex
CREATE INDEX "candidate_companies_organization_id_status_idx" ON "candidate_companies"("organization_id", "status");

-- CreateIndex
CREATE INDEX "candidate_companies_organization_id_siren_idx" ON "candidate_companies"("organization_id", "siren");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_establishments_id_organization_id_key" ON "candidate_establishments"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_establishments_organization_id_siret_key" ON "candidate_establishments"("organization_id", "siret");

-- CreateIndex
CREATE INDEX "candidate_establishments_organization_id_candidate_company_idx" ON "candidate_establishments"("organization_id", "candidate_company_id");

-- AddForeignKey
ALTER TABLE "candidate_companies" ADD CONSTRAINT "candidate_companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_establishments" ADD CONSTRAINT "candidate_establishments_candidate_company_id_organizatio_fkey" FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contraintes CHECK non exprimables dans le DSL Prisma (mêmes conventions que client_accounts.status,
-- company_legal_identities.status, etc. — écrites à la main).
ALTER TABLE "candidate_companies" ADD CONSTRAINT "candidate_companies_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

-- Au plus un établissement principal par entreprise candidate (mission §8) — index unique partiel,
-- non exprimable dans le DSL Prisma.
CREATE UNIQUE INDEX "candidate_establishments_one_principal_per_company" ON "candidate_establishments"("candidate_company_id") WHERE "is_principal" = true;
