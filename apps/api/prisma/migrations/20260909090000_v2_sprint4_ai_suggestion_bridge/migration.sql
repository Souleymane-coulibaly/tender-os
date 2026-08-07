-- V2 Sprint 4 — Analyse IA du DCE : contexte de cible explicite sur AiSuggestion (bridge
-- Analysis -> Tenders/Buyer), catalogue entityType étendu, et révisions utilisateur de la
-- synthèse IA. Additif uniquement, aucune ancienne migration modifiée, aucune table/colonne
-- supprimée.

-- 1) entity_id devient nullable : une suggestion de CREATION (ex. proposer un nouveau lot) n'a
--    pas encore de cible existante au moment de sa création.
ALTER TABLE "ai_suggestions" ALTER COLUMN "entity_id" DROP NOT NULL;

-- 2) Contexte de cible explicite, jamais uniquement encodé dans proposedValue (audit Codex
--    Sprint 4 — "toute relation doit être tenantée et vérifiée").
--    Correctif audit Codex P1-002 (round 3) — un garde-fou qui ÉCHOUE la migration sur une base
--    contenant des lignes préexistantes bloque un déploiement (constat justifié de l'audit : "pas
--    une migration déployable"). La colonne est donc ajoutée NULLABLE, puis toute ligne SANS
--    parent_tender_id résolvable est ARCHIVÉE AUTOMATIQUEMENT (jamais supprimée sans trace) dans
--    une table dédiée avant que SET NOT NULL ne s'applique — la migration réussit TOUJOURS,
--    déterministiquement, sans intervention manuelle, quel que soit l'état de la base. Aucun
--    backfill déterministe n'existe pour d'anciennes suggestions Sprint 1 (leur entityType/entityId
--    ne portent structurellement aucune relation vers un Tender — catalogue TENDER_LOT/
--    CHECKLIST_ITEM/etc., jamais un producteur câblé avant ce sprint) : l'archivage est donc la
--    seule stratégie à la fois sûre (rien n'est perdu) et toujours déployable.
CREATE TABLE "ai_suggestions_orphaned_archive" (
    "id" UUID NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "reason" TEXT NOT NULL,
    "row_snapshot" JSONB NOT NULL,

    CONSTRAINT "ai_suggestions_orphaned_archive_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_suggestions" ADD COLUMN "parent_tender_id" UUID;
ALTER TABLE "ai_suggestions" ADD COLUMN "parent_lot_id" UUID;

INSERT INTO "ai_suggestions_orphaned_archive" ("id", "reason", "row_snapshot")
SELECT "id",
       'V2 Sprint 4 migration (20260909090000) : aucun parent_tender_id résolvable pour cette ligne préexistante — aucun backfill déterministe possible depuis entity_type/entity_id (catalogue Sprint 1, jamais de producteur câblé avant ce sprint).',
       to_jsonb("ai_suggestions".*)
FROM "ai_suggestions"
WHERE "parent_tender_id" IS NULL;

DELETE FROM "ai_suggestions" WHERE "parent_tender_id" IS NULL;

ALTER TABLE "ai_suggestions" ALTER COLUMN "parent_tender_id" SET NOT NULL;

-- 3) Décision explicite de résolution de conflit lorsque la cible porte déjà une valeur
--    (KEEP_CURRENT/REPLACE/MERGE/REJECT) — NULL tant qu'aucun conflit n'a été détecté/tranché.
ALTER TABLE "ai_suggestions" ADD COLUMN "conflict_resolution" VARCHAR(20);
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_conflict_resolution_check"
  CHECK ("conflict_resolution" IS NULL OR "conflict_resolution" IN ('KEEP_CURRENT', 'REPLACE', 'MERGE', 'REJECT'));

-- 4) FK tenantées vers Tender/TenderLot — jamais vers l'entité cible polymorphe elle-même
--    (entity_id reste volontairement dénormalisé, comme déjà documenté sur la table).
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_parent_tender_id_organization_id_fkey"
  FOREIGN KEY ("parent_tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Correctif audit Codex P1-003 — une FK à 2 colonnes (parent_lot_id, organization_id) vérifie
-- seulement que le lot appartient à la MÊME organisation, jamais qu'il appartient au MÊME Tender
-- que parent_tender_id : une suggestion aurait pu référencer un lot d'un AUTRE Tender du même
-- tenant sans qu'aucune contrainte ne le refuse. Corrigé structurellement (jamais contournable par
-- un bug applicatif) via une FK à 3 colonnes vers une nouvelle clé composite sur tender_lots
-- (même motif AUDIT-007 déjà en usage partout ailleurs dans ce schéma).
ALTER TABLE "tender_lots" ADD CONSTRAINT "tender_lots_id_organization_id_tender_id_key" UNIQUE ("id", "organization_id", "tender_id");

ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_parent_lot_id_org_tender_fkey"
  FOREIGN KEY ("parent_lot_id", "organization_id", "parent_tender_id") REFERENCES "tender_lots"("id", "organization_id", "tender_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ai_suggestions_organization_id_parent_tender_id_idx" ON "ai_suggestions"("organization_id", "parent_tender_id");

-- 5) Catalogue entity_type étendu (additif) — conserve toutes les valeurs existantes, y compris
--    celles réservées à de futurs sprints (DC1/DC2/DC4/ATTRI1/TECHNICAL_MEMO_SECTION/
--    PRICING_LINE/CHECKLIST_ITEM/SUBCONTRACTOR_PROFILE/COMPANY_LEGAL_IDENTITY/TENDER_LOT).
ALTER TABLE "ai_suggestions" DROP CONSTRAINT "ai_suggestions_entity_type_check";
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_entity_type_check"
  CHECK ("entity_type" IN (
    'TENDER_LOT', 'CHECKLIST_ITEM', 'SUBCONTRACTOR_PROFILE', 'DC1', 'DC2', 'DC4', 'ATTRI1',
    'TECHNICAL_MEMO_SECTION', 'PRICING_LINE', 'COMPANY_LEGAL_IDENTITY',
    'TENDER_FIELD', 'TENDER_LOT_FIELD', 'TENDER_AWARD_CRITERION', 'TENDER_REQUESTED_DOCUMENT',
    'TENDER_MILESTONE', 'TENDER_RISK', 'BUYER_FIELD'
  ));

-- 6) TenderAnalysisSummary : ajout de la clé composite tenantée (même motif AUDIT-007 déjà en
--    usage ailleurs) pour supporter une FK composite correcte depuis les révisions utilisateur.
ALTER TABLE "tender_analysis_summaries" ADD CONSTRAINT "tender_analysis_summaries_id_organization_id_key" UNIQUE ("id", "organization_id");

-- 7) Révisions utilisateur de la synthèse IA — jamais une mutation de tender_analysis_summaries
--    (immuable, versionnée par analysisVersion). Seuls les champs effectivement corrigés sont
--    renseignés ; la lecture retombe sur la valeur IA d'origine pour tout champ NULL ici.
CREATE TABLE "tender_analysis_summary_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "base_summary_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,

    "opportunity_summary" TEXT,
    "complexity_level" VARCHAR(20),
    "main_criteria" JSONB,
    "main_risks" JSONB,
    "main_obligations" JSONB,
    "missing_elements" JSONB,
    "points_to_clarify" JSONB,
    "conflicts" JSONB,

    "edited_by_user_id" UUID NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "reason" TEXT,

    CONSTRAINT "tender_analysis_summary_revisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tender_analysis_summary_revisions" ADD CONSTRAINT "tender_analysis_summary_revisions_complexity_level_check"
  CHECK ("complexity_level" IS NULL OR "complexity_level" IN ('LOW', 'MEDIUM', 'HIGH'));

ALTER TABLE "tender_analysis_summary_revisions" ADD CONSTRAINT "tender_analysis_summary_revisions_base_summary_id_organization_id_fkey"
  FOREIGN KEY ("base_summary_id", "organization_id") REFERENCES "tender_analysis_summaries"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_analysis_summary_revisions" ADD CONSTRAINT "tender_analysis_summary_revisions_tender_id_organization_id_fkey"
  FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "tender_analysis_summary_revisions_org_base_revision_key" ON "tender_analysis_summary_revisions"("organization_id", "base_summary_id", "revision_number");
CREATE INDEX "tender_analysis_summary_revisions_organization_id_tender_id_idx" ON "tender_analysis_summary_revisions"("organization_id", "tender_id");

-- 8) Correctif audit Codex P1-001 — statut intermédiaire APPLYING (additif au catalogue existant
--    PENDING/ACCEPTED/MODIFIED/REJECTED). Le bridge réserve une suggestion (PENDING -> APPLYING)
--    AVANT d'écrire la donnée métier cible, ce qui rend impossible tout double-clic/retry qui
--    dupliquerait l'effet métier (ex. créer deux fois le même jalon) : une seconde tentative ne
--    trouve plus PENDING et échoue proprement. Si l'écriture métier échoue, la réservation est
--    annulée (APPLYING -> PENDING) et la suggestion redevient normalement retentable. Voir
--    ApplyAiSuggestionUseCase pour la séquence complète et sa justification (une transaction
--    Postgres unique couvrant Tenders + AiSuggestion n'est pas réalisable sans une refonte majeure
--    de l'architecture modulaire de ce dépôt — ce verrou applicatif est l'alternative retenue).
ALTER TABLE "ai_suggestions" DROP CONSTRAINT "ai_suggestions_status_check";
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_status_check"
  CHECK ("status" IN ('PENDING', 'APPLYING', 'ACCEPTED', 'MODIFIED', 'REJECTED'));

-- 9) Correctif audit Codex P1-004 (round 3) — capture la version documentaire EXACTE analysée
--    (jamais "la version courante au moment du mapping", qui peut avoir changé entre-temps si le
--    fichier a été remplacé). Nullable : additif, une ligne écrite avant ce sprint n'a jamais eu
--    cette information et le reste légitimement. Répété sur les 4 tables de Finding réellement
--    mappées vers AiSuggestion (Deadline/Criterion/Requirement/Risk — jamais Clause/Question, qui
--    ne sont jamais mappées, mission §9) : c'est la capture au niveau du Finding lui-même, au
--    moment précis de `persistTenderConsolidation`, qui garantit l'immunité à toute dérive de
--    version ultérieure (jamais une valeur re-dérivée après coup via une jointure).
ALTER TABLE "document_business_analyses" ADD COLUMN "document_version_id" UUID;
ALTER TABLE "tender_deadline_findings" ADD COLUMN "document_version_id" UUID;
ALTER TABLE "tender_criterion_findings" ADD COLUMN "document_version_id" UUID;
ALTER TABLE "tender_requirement_findings" ADD COLUMN "document_version_id" UUID;
ALTER TABLE "tender_risk_findings" ADD COLUMN "document_version_id" UUID;
