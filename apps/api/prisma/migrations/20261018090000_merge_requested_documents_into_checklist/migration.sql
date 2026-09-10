-- TENDEROS-2.1 — Fusion des « Pièces demandées » dans la Checklist.
--
-- Depuis le V2 Sprint 6, l'analyse IA n'alimente plus `tender_requested_documents` : toute
-- exigence du DCE devient un élément de checklist (`finding-to-suggestion-mapper.ts`,
-- « CHANGEMENT DE RESPONSABILITÉ »). La table n'était plus remplie que par saisie manuelle, mais
-- continuait de peser 25 points du score de préparation et d'alimenter le GO/NO-GO — deux
-- mécanismes de suivi des pièces pour une seule réalité métier.
--
-- Cette migration reprend chaque pièce demandée en élément de checklist. Additive uniquement :
-- aucune ancienne migration modifiée, aucune ligne de `tender_requested_documents` modifiée ni
-- supprimée. La table source est CONSERVÉE en l'état ; plus aucun code applicatif ne l'écrit.
-- Sa suppression éventuelle relèvera d'une migration distincte, après une décision de conservation
-- explicite — jamais d'une décision implicite prise ici.
--
-- Correspondance des champs — chaque règle reproduit celle du domaine Checklist, jamais une
-- sémantique inventée pour l'occasion :
--
--   name / description           -> title / description
--   catégorie, type, format, signature, modèle acheteur, expiration
--                                -> ajoutés au texte de `description` (aucune colonne équivalente :
--                                   rien n'est perdu, rien n'est réinterprété)
--   required                     -> required + requirement_level MANDATORY / CONDITIONAL
--                                   (même règle que l'analyse IA : `isMandatory ? MANDATORY : CONDITIONAL`)
--   is_eliminatory               -> criticality BLOCKING (sinon MEDIUM, défaut du domaine)
--   lot_id                       -> lot_id
--   document_id                  -> document rapproché, `MANUALLY_ATTACHED`, version COURANTE du
--                                   document — la checklist exige une version précise, jamais
--                                   « la dernière » implicite. Un document SANS version (donnée
--                                   héritée, voir H.5) n'est PAS rattaché : noté, jamais inventé.
--   statut                       -> reproduit `ChecklistItem.attachDocument` puis `deriveLegacyStatus` :
--                                   VALIDATED  -> VALIDATED (legacy COMPLETED)
--                                   REJECTED   -> NON_COMPLIANT
--                                   document disponible -> READY ; document expiré -> NON_COMPLIANT
--                                   sinon      -> TO_REVIEW
--                                   Une pièce PROVIDED SANS document ne devient PAS READY : dans la
--                                   checklist, READY signifie « un document est là, reste à le
--                                   valider ». Elle devient TO_REVIEW, avec une note.
--   origin                       -> MANUAL. Délibéré : la réconciliation marque STALE tout élément
--                                   `origin <> MANUAL` absent de la dernière analyse. Une pièce
--                                   saisie à la main n'est jamais issue du DCE ; en SYSTEM, elle
--                                   deviendrait périmée à l'analyse suivante.
--   completed_by                 -> NULL pour une pièce VALIDATED : l'auteur de la validation
--                                   n'est pas connu de la table source, et n'est jamais inventé.
--
-- Doublons : si un élément de checklist du MÊME appel d'offres porte déjà exactement le même titre
-- (casse et espaces de bord ignorés), aucune ligne n'est créée — la correspondance relie la pièce à
-- l'élément existant. L'élément existant n'est jamais revalidé à partir de la pièce. Seul son
-- document peut être repris, et uniquement s'il est encore intact (aucun document, TO_REVIEW) :
-- jamais l'écrasement d'un travail humain déjà fait. Aucune fusion sur ressemblance approximative.
--
-- Traçabilité : chaque pièce reprise laisse exactement une ligne dans
-- `tender_requested_document_checklist_migrations`. La migration est rejouable sans double
-- création : une pièce déjà présente dans cette table est ignorée.

CREATE TABLE "tender_requested_document_checklist_migrations" (
    "requested_document_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "note" TEXT,
    "migrated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_requested_document_checklist_migrations_pkey" PRIMARY KEY ("requested_document_id")
);

ALTER TABLE "tender_requested_document_checklist_migrations" ADD CONSTRAINT "tender_requested_document_checklist_migrations_outcome_check"
  CHECK ("outcome" IN ('CREATED', 'LINKED_EXISTING'));

-- Noms d'index : ceux que Prisma génère lui-même pour ces colonnes. Les noms « naturels »
-- (76 et 68 caractères) dépassent la limite de 63 caractères de PostgreSQL, qui les tronque sans
-- avertir — et pas comme Prisma, qui y verrait alors une dérive à renommer.
CREATE INDEX "tender_requested_document_checklist_migrations_organization_idx" ON "tender_requested_document_checklist_migrations"("organization_id", "tender_id");

CREATE INDEX "tender_requested_document_checklist_migrations_checklist_it_idx" ON "tender_requested_document_checklist_migrations"("checklist_item_id");

WITH
  -- Horloge unique pour toute l'opération, en UTC comme les colonnes TIMESTAMP(3) écrites par Prisma.
  clock AS MATERIALIZED (
    SELECT (now() AT TIME ZONE 'UTC') AS at
  ),
  source AS MATERIALIZED (
    SELECT
      rd."id",
      rd."organization_id",
      rd."tender_id",
      rd."name",
      rd."description",
      rd."category",
      rd."document_type",
      rd."required",
      rd."expiration_date",
      rd."status",
      rd."document_id",
      rd."is_eliminatory",
      rd."lot_id",
      rd."requested_format",
      rd."signature_required",
      rd."buyer_provided_template",
      rd."display_order",
      rd."created_at",
      rd."updated_at",
      gen_random_uuid() AS "new_item_id",
      d."current_version_id" AS "document_version_id",
      (rd."document_id" IS NOT NULL AND d."current_version_id" IS NOT NULL) AS "has_document",
      existing."id" AS "existing_item_id",
      existing."matched_document_id" AS "existing_document_id",
      existing."compliance_status" AS "existing_compliance_status"
    FROM "tender_requested_documents" rd
    LEFT JOIN "documents" d ON d."id" = rd."document_id"
    LEFT JOIN LATERAL (
      SELECT c."id", c."matched_document_id", c."compliance_status"
      FROM "tender_checklist_items" c
      WHERE c."organization_id" = rd."organization_id"
        AND c."tender_id" = rd."tender_id"
        AND lower(btrim(c."title")) = lower(btrim(rd."name"))
      ORDER BY c."created_at", c."id"
      LIMIT 1
    ) existing ON TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM "tender_requested_document_checklist_migrations" m WHERE m."requested_document_id" = rd."id"
    )
  ),
  computed AS MATERIALIZED (
    SELECT
      s.*,
      (s."has_document" AND s."expiration_date" IS NOT NULL AND s."expiration_date" < (SELECT at FROM clock)) AS "document_expired",
      -- Plusieurs pièces peuvent désigner le même élément existant : une seule peut y reporter son
      -- document — la première, par ordre de création, PARMI CELLES QUI EN ONT UN. Numéroter toutes
      -- les pièces ensemble laisserait une pièce sans document « gagner » et priver l'élément du
      -- document d'une pièce suivante. Jamais un choix laissé au planificateur.
      (
        s."existing_item_id" IS NOT NULL
        AND s."has_document"
        AND s."existing_document_id" IS NULL
        AND s."existing_compliance_status" = 'TO_REVIEW'
        AND row_number() OVER (PARTITION BY s."existing_item_id", s."has_document" ORDER BY s."created_at", s."id") = 1
      ) AS "carries_document"
    FROM source s
  ),
  to_create AS MATERIALIZED (
    SELECT
      c.*,
      (SELECT coalesce(max(ci."display_order"), -1) FROM "tender_checklist_items" ci WHERE ci."tender_id" = c."tender_id")
        + row_number() OVER (PARTITION BY c."tender_id" ORDER BY c."display_order", c."created_at", c."id") AS "new_display_order",
      CASE
        WHEN c."status" = 'VALIDATED' THEN 'VALIDATED'
        WHEN c."status" = 'REJECTED' THEN 'NON_COMPLIANT'
        WHEN c."has_document" AND c."document_expired" THEN 'NON_COMPLIANT'
        WHEN c."has_document" THEN 'READY'
        ELSE 'TO_REVIEW'
      END AS "compliance_status",
      concat_ws(
        E'\n',
        CASE WHEN c."category" IS NOT NULL AND btrim(c."category") <> '' THEN 'Catégorie : ' || c."category" END,
        CASE WHEN c."document_type" IS NOT NULL AND btrim(c."document_type") <> '' THEN 'Type de document : ' || c."document_type" END,
        CASE WHEN c."requested_format" IS NOT NULL AND btrim(c."requested_format") <> '' THEN 'Format demandé : ' || c."requested_format" END,
        CASE WHEN c."signature_required" THEN 'Signature requise' END,
        CASE WHEN c."buyer_provided_template" THEN 'Modèle fourni par l''acheteur' END,
        CASE WHEN c."expiration_date" IS NOT NULL THEN 'Date d''expiration : ' || to_char(c."expiration_date", 'DD/MM/YYYY') END
      ) AS "carried_metadata"
    FROM computed c
    WHERE c."existing_item_id" IS NULL
  ),
  inserted AS (
    INSERT INTO "tender_checklist_items" (
      "id", "organization_id", "tender_id", "title", "description", "required", "status",
      "completed_at", "completed_by", "display_order", "type", "requirement_level", "criticality",
      "compliance_status", "document_status", "origin", "requirement_freshness", "subject_type", "lot_id",
      "matched_document_id", "matched_document_version_id", "document_match_status",
      "document_expires_at", "document_validity_checked_at", "created_at", "updated_at"
    )
    SELECT
      t."new_item_id",
      t."organization_id",
      t."tender_id",
      t."name",
      concat_ws(
        E'\n\n',
        NULLIF(btrim(t."description"), ''),
        'Repris de l''ancienne section « Pièces demandées ».'
          || CASE WHEN t."carried_metadata" <> '' THEN E'\n' || t."carried_metadata" ELSE '' END
      ),
      t."required",
      -- `deriveLegacyStatus` : VALIDATED -> COMPLETED ; un document rapproché est un signal de
      -- progression -> IN_PROGRESS ; sinon TODO (origin MANUAL, aucun assigné).
      CASE
        WHEN t."compliance_status" = 'VALIDATED' THEN 'COMPLETED'
        WHEN t."has_document" THEN 'IN_PROGRESS'
        ELSE 'TODO'
      END,
      CASE WHEN t."compliance_status" = 'VALIDATED' THEN t."updated_at" END,
      NULL,
      t."new_display_order",
      'ADMINISTRATIVE_DOCUMENT',
      CASE WHEN t."required" THEN 'MANDATORY' ELSE 'CONDITIONAL' END,
      CASE WHEN t."is_eliminatory" THEN 'BLOCKING' ELSE 'MEDIUM' END,
      t."compliance_status",
      CASE WHEN NOT t."has_document" THEN 'MISSING' WHEN t."document_expired" THEN 'EXPIRED' ELSE 'AVAILABLE' END,
      'MANUAL',
      'CURRENT',
      'CANDIDATE',
      t."lot_id",
      CASE WHEN t."has_document" THEN t."document_id" END,
      CASE WHEN t."has_document" THEN t."document_version_id" END,
      CASE WHEN t."has_document" THEN 'MANUALLY_ATTACHED' ELSE 'NOT_SEARCHED' END,
      CASE WHEN t."has_document" THEN t."expiration_date" END,
      CASE WHEN t."has_document" THEN (SELECT at FROM clock) END,
      t."created_at",
      (SELECT at FROM clock)
    FROM to_create t
    RETURNING "id"
  ),
  carried AS (
    -- Reprise du document sur un élément existant intact : même effet que `attachDocument`
    -- (READY, ou NON_COMPLIANT si expiré), puis `deriveLegacyStatus` (IN_PROGRESS).
    UPDATE "tender_checklist_items" ci
    SET
      "matched_document_id" = c."document_id",
      "matched_document_version_id" = c."document_version_id",
      "document_match_status" = 'MANUALLY_ATTACHED',
      "document_expires_at" = c."expiration_date",
      "document_validity_checked_at" = (SELECT at FROM clock),
      "document_status" = CASE WHEN c."document_expired" THEN 'EXPIRED' ELSE 'AVAILABLE' END,
      "compliance_status" = CASE WHEN c."document_expired" THEN 'NON_COMPLIANT' ELSE 'READY' END,
      "status" = 'IN_PROGRESS',
      "updated_at" = (SELECT at FROM clock)
    FROM computed c
    WHERE c."carries_document" AND ci."id" = c."existing_item_id"
    RETURNING ci."id"
  )
INSERT INTO "tender_requested_document_checklist_migrations" (
  "requested_document_id", "organization_id", "tender_id", "checklist_item_id", "outcome", "note"
)
SELECT
  c."id",
  c."organization_id",
  c."tender_id",
  coalesce(c."existing_item_id", c."new_item_id"),
  CASE WHEN c."existing_item_id" IS NULL THEN 'CREATED' ELSE 'LINKED_EXISTING' END,
  NULLIF(
    concat_ws(
      ' ; ',
      CASE WHEN c."status" NOT IN ('PENDING', 'PROVIDED', 'VALIDATED', 'REJECTED') THEN 'statut source inconnu (' || c."status" || ') repris en TO_REVIEW' END,
      CASE WHEN c."existing_item_id" IS NULL AND c."status" = 'PROVIDED' AND NOT c."has_document" THEN 'pièce marquée fournie sans document rattaché : reprise en TO_REVIEW' END,
      CASE WHEN c."document_id" IS NOT NULL AND c."document_version_id" IS NULL THEN 'document sans version courante : non rattaché' END,
      CASE WHEN c."existing_item_id" IS NOT NULL THEN 'élément de checklist de même titre déjà présent ; statut source ' || c."status" || ' non reporté' END,
      CASE WHEN c."carries_document" THEN 'document reporté sur l''élément existant' END,
      CASE WHEN c."existing_item_id" IS NOT NULL AND c."has_document" AND NOT c."carries_document" THEN 'document non reporté : l''élément existant avait déjà un document ou avait déjà été traité' END
    ),
    ''
  )
FROM computed c;
