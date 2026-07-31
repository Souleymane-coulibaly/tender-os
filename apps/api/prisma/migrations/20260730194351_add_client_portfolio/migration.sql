-- Sprint 5.1 — Client Portfolio Management
-- Migration non destructive : crée ClientAccount/ClientAssignment, rattache TOUS les Tenders
-- existants à un client par défaut ("Compte principal") créé pour chaque organisation, affecte
-- toutes les Memberships actives existantes à ce client par défaut (préserve l'accès déjà en
-- place avant ce sprint — voir rapport final §E pour la justification de cette stratégie),
-- PUIS seulement rend `tenders.client_account_id` obligatoire. `knowledge_entries.client_account_id`
-- reste nullable (NULL = connaissance globale) — aucune connaissance existante ne devient
-- automatiquement "client-specific".

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "client_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_normalized" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(240),
    "reference" VARCHAR(100),
    "sector" VARCHAR(120),
    "country" VARCHAR(10),
    "address" TEXT,
    "website" VARCHAR(2048),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_accounts_organization_id_status_idx" ON "client_accounts"("organization_id", "status");
CREATE INDEX "client_accounts_organization_id_archived_at_idx" ON "client_accounts"("organization_id", "archived_at");
CREATE UNIQUE INDEX "client_accounts_id_organization_id_key" ON "client_accounts"("id", "organization_id");
CREATE UNIQUE INDEX "client_accounts_organization_id_name_normalized_key" ON "client_accounts"("organization_id", "name_normalized");

CREATE INDEX "client_assignments_organization_id_user_id_idx" ON "client_assignments"("organization_id", "user_id");
CREATE INDEX "client_assignments_organization_id_client_account_id_idx" ON "client_assignments"("organization_id", "client_account_id");
CREATE UNIQUE INDEX "client_assignments_organization_id_client_account_id_user_i_key" ON "client_assignments"("organization_id", "client_account_id", "user_id");

-- AddForeignKey
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (même motif que les enums Knowledge Base — jamais une chaîne libre non
-- contrôlée en base, en plus de la validation applicative).
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_role_check" CHECK ("role" IN ('CLIENT_MANAGER', 'CONTRIBUTOR', 'VIEWER'));

-- Étape 1 — un client par défaut par organisation existante ("Compte principal", nom constant et
-- documenté, mission §"Migration des données existantes"). `created_by`/`updated_by` : le premier
-- utilisateur trouvé avec une Membership active dans l'organisation, à défaut le créateur du plus
-- ancien Tender de l'organisation, à défaut un UUID nul explicite (aucune organisation réelle ne
-- devrait atteindre ce dernier repli, mais la colonne reste NOT NULL).
INSERT INTO "client_accounts" (
  "id", "organization_id", "name", "name_normalized", "status", "created_by", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  o."id",
  'Compte principal',
  'compte principal',
  'ACTIVE',
  COALESCE(
    (SELECT om."user_id" FROM "organization_memberships" om WHERE om."organization_id" = o."id" AND om."status" = 'ACTIVE' ORDER BY om."created_at" ASC LIMIT 1),
    (SELECT t."created_by" FROM "tenders" t WHERE t."organization_id" = o."id" ORDER BY t."created_at" ASC LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o;

-- Étape 2 — colonne nullable d'abord (tables existantes non vides), backfill, puis NOT NULL.
ALTER TABLE "tenders" ADD COLUMN "client_account_id" UUID;

UPDATE "tenders" t
SET "client_account_id" = ca."id"
FROM "client_accounts" ca
WHERE ca."organization_id" = t."organization_id" AND ca."name_normalized" = 'compte principal';

-- Garde-fou : aucune ligne orpheline ne doit subsister avant de verrouiller la colonne en NOT NULL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tenders" WHERE "client_account_id" IS NULL) THEN
    RAISE EXCEPTION 'Migration aborted: at least one tender has no client_account_id after backfill.';
  END IF;
END $$;

ALTER TABLE "tenders" ALTER COLUMN "client_account_id" SET NOT NULL;

CREATE INDEX "tenders_organization_id_client_account_id_idx" ON "tenders"("organization_id", "client_account_id");
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Étape 3 — Knowledge Base : colonne nullable, JAMAIS de backfill (toute entrée existante reste
-- une connaissance GLOBALE de l'organisation — mission §"une connaissance globale n'est pas
-- automatiquement client-specific").
ALTER TABLE "knowledge_entries" ADD COLUMN "client_account_id" UUID;
CREATE INDEX "knowledge_entries_organization_id_client_account_id_idx" ON "knowledge_entries"("organization_id", "client_account_id");
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Étape 4 — préserve l'accès déjà en place avant ce sprint SANS jamais l'élargir (correction
-- anomalie P1 "Backfill migration trop permissif") : chaque Membership active existante reçoit une
-- affectation sur le client par défaut de son organisation, mais le RÔLE CLIENT accordé est dérivé
-- explicitement de son rôle d'organisation ACTUEL — table de correspondance ci-dessous — jamais un
-- CLIENT_MANAGER uniforme. Le principe est : le rôle client par défaut ne doit JAMAIS conférer plus
-- de droits d'écriture que ce que le rôle d'organisation autorisait déjà (voir
-- ROLE_TENDER_PERMISSIONS, apps/api/src/modules/tenders/domain/tender-permission.ts, qui documente
-- la même hiérarchie : OWNER/ORGANIZATION_ADMIN/BID_MANAGER ont l'écriture complète sur les
-- Tenders, CONTRIBUTOR n'a qu'une écriture limitée (checklist), tous les autres rôles
-- (REVIEWER/EXECUTIVE/EXTERNAL_CONSULTANT/READ_ONLY) sont strictement en lecture) :
--   OWNER / ORGANIZATION_ADMIN / BID_MANAGER -> CLIENT_MANAGER (écriture complète déjà détenue)
--   CONTRIBUTOR                              -> CONTRIBUTOR    (écriture limitée déjà détenue)
--   tout autre rôle (REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY, ou un rôle futur/inconnu)
--                                             -> VIEWER          (lecture seule, jamais d'écriture
--                                                                  nouvellement accordée)
-- Les NOUVEAUX clients créés après cette migration démarrent, eux, sans affectation implicite.
-- Correction P0 (Sprint 5.2, chaîne de migrations) : "organization_memberships" n'a jamais eu de
-- colonne "role" — le rôle d'une Membership passe exclusivement par la table de jonction
-- "membership_roles"/"roles" (docs/04-architecture/DATABASE_DESIGN.md §6.1, même lecture que
-- organization-membership.persistence-mapper.ts). La référence originale à om."role" ne pouvait
-- réussir que sur une base ayant déjà dévié de ce schéma ; corrigée ici pour que la chaîne de
-- migrations rejoue proprement sur une base fraîche (shadow database Prisma incluse), sans changer
-- la logique métier de correspondance de rôles décrite ci-dessus.
INSERT INTO "client_assignments" ("id", "organization_id", "client_account_id", "user_id", "role", "created_by", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  om."organization_id",
  ca."id",
  om."user_id",
  CASE (
    SELECT r."code"
    FROM "membership_roles" mr
    JOIN "roles" r ON r."id" = mr."role_id"
    WHERE mr."membership_id" = om."id"
    LIMIT 1
  )
    WHEN 'OWNER' THEN 'CLIENT_MANAGER'
    WHEN 'ORGANIZATION_ADMIN' THEN 'CLIENT_MANAGER'
    WHEN 'BID_MANAGER' THEN 'CLIENT_MANAGER'
    WHEN 'CONTRIBUTOR' THEN 'CONTRIBUTOR'
    ELSE 'VIEWER'
  END,
  om."user_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organization_memberships" om
JOIN "client_accounts" ca ON ca."organization_id" = om."organization_id" AND ca."name_normalized" = 'compte principal'
WHERE om."status" = 'ACTIVE';
