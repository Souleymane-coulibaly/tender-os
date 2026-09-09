-- TenderOS 2.1 — Checkpoint CCV2-C (capacités candidate : propriété native)
--
-- POURQUOI CCV2-B NE SUFFISAIT PAS (mission §23 — aucune migration opportuniste) :
-- CCV2-B a introduit `candidate_company_id` pour ASSOCIER des lignes Legacy existantes, qui ont
-- toutes par construction un `client_account_id`. Il a délibérément laissé cette colonne NOT NULL
-- (finding CCV2-B P3-01, explicitement annoncé) parce qu'aucun chemin d'écriture candidate
-- n'existait alors : la rendre nullable n'aurait protégé aucun cas réel et aurait modifié le
-- contrat des DTO Legacy sans bénéfice.
-- CCV2-C ouvre précisément ce chemin d'écriture. Une CandidateCompany NATIVE (créée directement,
-- sans `source_client_account_id`) n'a AUCUN ClientAccount : avec `client_account_id` NOT NULL, il
-- lui serait structurellement impossible de posséder une capacité. Cette migration est donc la
-- condition d'existence de l'API CCV2-C, pas une commodité.
--
-- Strictement additive au sens des données : aucune ligne modifiée, aucune colonne supprimée.
-- Assouplir un NOT NULL ne peut invalider aucune ligne existante.

ALTER TABLE "company_representatives"    ALTER COLUMN "client_account_id" DROP NOT NULL;
ALTER TABLE "company_bank_accounts"      ALTER COLUMN "client_account_id" DROP NOT NULL;
ALTER TABLE "company_insurances"         ALTER COLUMN "client_account_id" DROP NOT NULL;
ALTER TABLE "company_certifications"     ALTER COLUMN "client_account_id" DROP NOT NULL;
ALTER TABLE "company_references"         ALTER COLUMN "client_account_id" DROP NOT NULL;
ALTER TABLE "company_human_resources"    ALTER COLUMN "client_account_id" DROP NOT NULL;
ALTER TABLE "company_material_resources" ALTER COLUMN "client_account_id" DROP NOT NULL;

-- INVARIANT "propriétaire absent" (mission CCV2-B §6, désormais exprimable) : une capacité
-- appartient TOUJOURS à quelqu'un — au ClientAccount Legacy, à la CandidateCompany, ou aux deux
-- pendant la transition (ligne associée). Une ligne orpheline est structurellement impossible.
ALTER TABLE "company_representatives"    ADD CONSTRAINT "company_representatives_owner_present_check"    CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
ALTER TABLE "company_bank_accounts"      ADD CONSTRAINT "company_bank_accounts_owner_present_check"      CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
ALTER TABLE "company_insurances"         ADD CONSTRAINT "company_insurances_owner_present_check"         CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
ALTER TABLE "company_certifications"     ADD CONSTRAINT "company_certifications_owner_present_check"     CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
ALTER TABLE "company_references"         ADD CONSTRAINT "company_references_owner_present_check"         CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
ALTER TABLE "company_human_resources"    ADD CONSTRAINT "company_human_resources_owner_present_check"    CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
ALTER TABLE "company_material_resources" ADD CONSTRAINT "company_material_resources_owner_present_check" CHECK ("client_account_id" IS NOT NULL OR "candidate_company_id" IS NOT NULL);
