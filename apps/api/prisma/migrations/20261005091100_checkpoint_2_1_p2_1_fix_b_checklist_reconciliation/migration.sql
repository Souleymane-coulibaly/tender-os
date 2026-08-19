-- Checkpoint 2.1-P2.1-FIX-B — DCE re-analysis / reconsolidation / checklist reconciliation
--
-- Additif uniquement : une colonne (avec défaut sûr) + une nouvelle table. Aucune suppression,
-- aucun DROP, aucune migration destructive, aucun backfill inventé.
--
-- 1) tender_checklist_items.requirement_freshness — axe orthogonal à compliance_status (mission
--    §15 "ne jamais confondre status et freshness"), CURRENT | STALE. NOT NULL DEFAULT 'CURRENT' :
--    tous les items existants (jamais évalués par un reconcile FIX-B) restent CURRENT par défaut —
--    jamais un STALE fabriqué rétroactivement sur un historique que ce checkpoint n'a jamais audité.
--
-- 2) tender_checklist_reconciliations — une ligne par Tender (upsert), trace la dernière
--    analysisVersion contre laquelle le reconcile a réellement tourné. Aucune ligne pour les
--    Tenders existants tant que reconcile n'a pas encore tourné dessus depuis ce checkpoint —
--    l'absence de ligne est lue comme "jamais réconcilié", jamais une fausse valeur "0" ou "1"
--    inventée.

ALTER TABLE "tender_checklist_items" ADD COLUMN "requirement_freshness" VARCHAR(10) NOT NULL DEFAULT 'CURRENT';

ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_requirement_freshness_check"
  CHECK ("requirement_freshness" IN ('CURRENT', 'STALE'));

CREATE TABLE "tender_checklist_reconciliations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "last_reconciled_analysis_version" INTEGER NOT NULL,
    "last_reconciled_dce_revision" INTEGER,
    "reconciled_by_user_id" UUID NOT NULL,
    "reconciled_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_checklist_reconciliations_pkey" PRIMARY KEY ("id")
);

-- Un Tender ne peut avoir qu'une seule ligne de réconciliation (upsert) — même motif que
-- Dce.tenderId (un Tender ne porte jamais plus d'un Dce).
CREATE UNIQUE INDEX "tender_checklist_reconciliations_tender_id_key" ON "tender_checklist_reconciliations"("tender_id");
CREATE INDEX "tender_checklist_reconciliations_organization_id_idx" ON "tender_checklist_reconciliations"("organization_id");

ALTER TABLE "tender_checklist_reconciliations" ADD CONSTRAINT "tender_checklist_reconciliations_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
