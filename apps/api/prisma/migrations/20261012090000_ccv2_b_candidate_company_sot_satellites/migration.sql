-- TenderOS 2.1 — Checkpoint CCV2-B (CandidateCompany SOT : satellites, documents, registre)
--
-- STRICTEMENT ADDITIVE. Aucune colonne supprimée, aucune colonne rendue NOT NULL sans backfill,
-- aucune donnée déplacée par cette migration (le backfill est un script séparé, rejouable).
--
-- MODÈLE RETENU : ASSOCIATION, jamais DÉPLACEMENT. `client_account_id` reste NOT NULL sur les
-- satellites : le chemin de lecture Legacy `/clients/:id/profile` continue de fonctionner
-- exactement comme avant (mission §9), et aucune ligne ne peut disparaître (mission §12). Dès que
-- `candidate_company_id` est renseigné, c'est `CandidateCompany` qui fait autorité et
-- `client_account_id` n'est plus qu'un pointeur de lignage — même discipline que
-- `candidate_companies.source_client_account_id`. Il n'existe donc JAMAIS deux copies de la donnée :
-- une seule ligne, deux chemins d'accès, un seul propriétaire métier.
--
-- Pourquoi PAS une contrainte XOR ici (mission §6 : "ne pas appliquer mécaniquement cette forme") :
-- un XOR imposerait de mettre `client_account_id` à NULL au moment du backfill, ce qui viderait
-- instantanément la fiche Legacy des clients migrés — exactement ce que §9 et la décision produit
-- "lecture seule pendant la transition" interdisent. La contrainte CORRECTE à ce stade du rollout
-- n'est pas "exactement un propriétaire" mais "un propriétaire candidate cohérent avec le lignage",
-- posée ci-dessous en FK composite à 3 colonnes.

-- ============================================================================
-- 1. CandidateCompany.trade_name (mission §3)
-- ============================================================================
ALTER TABLE "candidate_companies" ADD COLUMN "trade_name" VARCHAR(240);

-- Support de la FK de cohérence de lignage ci-dessous : une FK exige une contrainte d'unicité côté
-- cible. `source_client_account_id` est nullable — l'index unique l'accepte, et une CandidateCompany
-- native (source NULL) ne pourra structurellement pas s'approprier un satellite Legacy, ce qui est
-- le comportement voulu.
CREATE UNIQUE INDEX "candidate_companies_id_organization_id_source_client_acc_key"
  ON "candidate_companies" ("id", "organization_id", "source_client_account_id");

-- ============================================================================
-- 2. Propriété V2 sur les 7 satellites de CAPACITÉS
--    `company_legal_identities` est volontairement EXCLU : son contenu (raison sociale, SIREN,
--    SIRET, forme juridique) est déjà porté par CandidateCompany/CandidateEstablishment — le
--    repointer créerait la duplication de SOT que CCV2 vise précisément à supprimer.
--    `company_reference_documents` est EXCLU aussi : il appartient à `company_references` et suit
--    donc son propriétaire par cascade, sans colonne propre.
-- ============================================================================
ALTER TABLE "company_representatives"    ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "company_bank_accounts"      ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "company_insurances"         ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "company_certifications"     ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "company_references"         ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "company_human_resources"    ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "company_material_resources" ADD COLUMN "candidate_company_id" UUID;

CREATE INDEX "company_representatives_organization_id_candidate_compan_idx"    ON "company_representatives"("organization_id", "candidate_company_id");
CREATE INDEX "company_bank_accounts_organization_id_candidate_company__idx"    ON "company_bank_accounts"("organization_id", "candidate_company_id");
CREATE INDEX "company_insurances_organization_id_candidate_company_id_idx"     ON "company_insurances"("organization_id", "candidate_company_id");
CREATE INDEX "company_certifications_organization_id_candidate_company_idx"    ON "company_certifications"("organization_id", "candidate_company_id");
CREATE INDEX "company_references_organization_id_candidate_company_id_idx"     ON "company_references"("organization_id", "candidate_company_id");
CREATE INDEX "company_human_resources_organization_id_candidate_compan_idx"    ON "company_human_resources"("organization_id", "candidate_company_id");
CREATE INDEX "company_material_resources_organization_id_candidate_com_idx"    ON "company_material_resources"("organization_id", "candidate_company_id");

-- ---------------------------------------------------------------------------
-- 2a. ISOLATION TENANT — garantie EN BASE (mission §11)
--     FK composite (candidate_company_id, organization_id) : un satellite de l'organisation A ne
--     peut structurellement pas pointer vers une CandidateCompany de l'organisation B. Même motif
--     que candidate_establishments -> candidate_companies. ON DELETE RESTRICT (jamais CASCADE) :
--     supprimer une CandidateCompany ne doit jamais détruire silencieusement des capacités encore
--     rattachées à un ClientAccount Legacy vivant.
-- ---------------------------------------------------------------------------
ALTER TABLE "company_representatives"    ADD CONSTRAINT "company_representatives_candidate_company_id_organizatio_fkey"    FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_bank_accounts"      ADD CONSTRAINT "company_bank_accounts_candidate_company_id_organization__fkey"     FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_insurances"         ADD CONSTRAINT "company_insurances_candidate_company_id_organization_id_fkey"      FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_certifications"     ADD CONSTRAINT "company_certifications_candidate_company_id_organizatio_fkey"     FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_references"         ADD CONSTRAINT "company_references_candidate_company_id_organization_id_fkey"      FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_human_resources"    ADD CONSTRAINT "company_human_resources_candidate_company_id_organizati_fkey"     FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_candidate_company_id_organiz_fkey"      FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2b. COHÉRENCE DE LIGNAGE — garantie EN BASE (mission §6 "propriétaires incohérents")
--     Non exprimable dans le DSL Prisma (référence une contrainte d'unicité à 3 colonnes dont une
--     nullable), donc écrite à la main — même discipline que les CHECK et index uniques partiels
--     déjà présents dans ce dépôt.
--
--     Sémantique MATCH SIMPLE de PostgreSQL (le défaut) : la contrainte n'est vérifiée QUE si les
--     trois colonnes référençantes sont non NULL. Elle est donc :
--       - inerte pour une ligne non migrée      (candidate_company_id NULL) ;
--       - inerte pour une future ligne native   (client_account_id NULL, rendu possible en CCV2-C) ;
--       - ACTIVE pour toute ligne associée      -> interdit structurellement d'attacher une
--         certification du client X à la CandidateCompany migrée depuis le client Y.
-- ---------------------------------------------------------------------------
ALTER TABLE "company_representatives"    ADD CONSTRAINT "company_representatives_candidate_lineage_fkey"    FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_bank_accounts"      ADD CONSTRAINT "company_bank_accounts_candidate_lineage_fkey"      FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_insurances"         ADD CONSTRAINT "company_insurances_candidate_lineage_fkey"         FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_certifications"     ADD CONSTRAINT "company_certifications_candidate_lineage_fkey"     FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_references"         ADD CONSTRAINT "company_references_candidate_lineage_fkey"         FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_human_resources"    ADD CONSTRAINT "company_human_resources_candidate_lineage_fkey"    FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_candidate_lineage_fkey" FOREIGN KEY ("candidate_company_id", "organization_id", "client_account_id") REFERENCES "candidate_companies"("id", "organization_id", "source_client_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 3. Documents d'entreprise candidate — ASSOCIATION uniquement, jamais un second moteur
-- ============================================================================
CREATE TABLE "document_candidate_company_associations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "candidate_company_id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "label" VARCHAR(240),
    "issued_at" TIMESTAMP(3),
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_candidate_company_associations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_candidate_company_associations_document_id_candi_key" ON "document_candidate_company_associations"("document_id", "candidate_company_id");
CREATE INDEX "document_candidate_company_associations_organization_id_c_idx"      ON "document_candidate_company_associations"("organization_id", "candidate_company_id");
CREATE INDEX "document_candidate_company_associations_organization_id_d_idx"      ON "document_candidate_company_associations"("organization_id", "document_id");

ALTER TABLE "document_candidate_company_associations" ADD CONSTRAINT "document_candidate_company_associations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Isolation tenant garantie en base : (candidate_company_id, organization_id) composite.
ALTER TABLE "document_candidate_company_associations" ADD CONSTRAINT "document_candidate_company_associations_candidate_compan_fkey" FOREIGN KEY ("candidate_company_id", "organization_id") REFERENCES "candidate_companies"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_candidate_company_associations" ADD CONSTRAINT "document_candidate_company_associations_category_check" CHECK (
  "category" IN ('KBIS', 'TAX_CERTIFICATE', 'SOCIAL_CERTIFICATE', 'ARTICLES_OF_ASSOCIATION', 'INSURANCE', 'CERTIFICATION', 'BANK_DETAILS', 'REFERENCE', 'POWER_OF_ATTORNEY', 'CV', 'OTHER')
);

-- Une période de validité inversée est une donnée fausse, jamais une donnée "à interpréter".
ALTER TABLE "document_candidate_company_associations" ADD CONSTRAINT "document_candidate_company_associations_validity_range_check" CHECK (
  "valid_from" IS NULL OR "valid_until" IS NULL OR "valid_until" >= "valid_from"
);

-- ============================================================================
-- 4. Registre de migration (mission §8)
-- ============================================================================
CREATE TABLE "candidate_migration_register" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING_PRODUCT_DECISION',
    "legacy_satellite_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_migration_register_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_migration_register_organization_id_client_accou_key" ON "candidate_migration_register"("organization_id", "client_account_id");
CREATE INDEX "candidate_migration_register_organization_id_status_idx"            ON "candidate_migration_register"("organization_id", "status");

ALTER TABLE "candidate_migration_register" ADD CONSTRAINT "candidate_migration_register_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "candidate_migration_register" ADD CONSTRAINT "candidate_migration_register_reason_check" CHECK ("reason" IN ('NO_CANDIDATE_COMPANY', 'AMBIGUOUS_SOURCE'));
ALTER TABLE "candidate_migration_register" ADD CONSTRAINT "candidate_migration_register_status_check" CHECK ("status" IN ('PENDING_PRODUCT_DECISION', 'RESOLVED'));
