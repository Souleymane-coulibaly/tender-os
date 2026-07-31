/*
  Warnings:

  - Added the required column `pricing_currency` to the `benchmark_run_models` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_effective_from` to the `benchmark_run_models` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_input_price_per_million_tokens` to the `benchmark_run_models` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_output_price_per_million_tokens` to the `benchmark_run_models` table without a default value. This is not possible if the table is not empty.

  Corrigé (audit Codex — réaudit Sprints 5.1/5.2) : Prisma avait généré ces 4 colonnes directement
  en NOT NULL sans defaut ni backfill, ce que PostgreSQL refuse dès que "benchmark_run_models"
  contient au moins une ligne. Stratégie sûre appliquée à la place :
    1. colonnes ajoutées NULLABLE ;
    2. backfill de chaque ligne existante depuis le snapshot tarifaire DÉJÀ référencé par
       "pricing_snapshot_id" (colonne NOT NULL + FK depuis la migration précédente — c'est donc
       EXACTEMENT le snapshot réellement utilisé au lancement de ce run, jamais une reconstruction
       approximative par date) ;
    3. garde-fou qui interrompt la migration si une ligne reste non renseignable (jamais un prix à
       zéro ou une absence de tarif masquée) ;
    4. contraintes NOT NULL appliquées seulement une fois toutes les lignes valides.
  Sûr sur une base vide (l'UPDATE affecte 0 ligne, le garde-fou passe trivialement) comme sur une
  base contenant déjà des BenchmarkRunModel/benchmarks exécutés.
*/
-- AlterTable (colonnes NULLABLE dans un premier temps — jamais NOT NULL sans backfill préalable)
ALTER TABLE "benchmark_run_models" ADD COLUMN     "pricing_cached_input_price_per_million_tokens" DECIMAL(14,6),
ADD COLUMN     "pricing_currency" VARCHAR(3),
ADD COLUMN     "pricing_effective_from" TIMESTAMP(3),
ADD COLUMN     "pricing_input_price_per_million_tokens" DECIMAL(14,6),
ADD COLUMN     "pricing_output_price_per_million_tokens" DECIMAL(14,6),
ADD COLUMN     "pricing_source" VARCHAR(30) NOT NULL DEFAULT 'PRICING_SNAPSHOT';

-- Backfill : chaque ligne existante récupère le tarif du snapshot qu'elle référence déjà via
-- "pricing_snapshot_id" (jamais le tarif courant du modèle, jamais une valeur devinée) — c'est la
-- reconstruction fidèle de ce qui aurait été figé si cette colonne avait existé au moment du
-- lancement du run.
UPDATE "benchmark_run_models" brm
SET
  "pricing_currency" = s."currency",
  "pricing_input_price_per_million_tokens" = s."input_price_per_million_tokens",
  "pricing_output_price_per_million_tokens" = s."output_price_per_million_tokens",
  "pricing_effective_from" = s."effective_from"
FROM "ai_model_pricing_snapshots" s
WHERE s."id" = brm."pricing_snapshot_id"
  AND brm."pricing_currency" IS NULL;

-- Garde-fou : n'accepte jamais de verrouiller la colonne en NOT NULL si une ligne reste sans tarif
-- figé (ex. "pricing_snapshot_id" orphelin — ne devrait jamais arriver vu la FK, mais on ne masque
-- jamais silencieusement une absence de tarif réel en la remplaçant par zéro).
DO $$
DECLARE
  unbackfilled_count INT;
BEGIN
  SELECT count(*) INTO unbackfilled_count FROM "benchmark_run_models" WHERE "pricing_currency" IS NULL;
  IF unbackfilled_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % benchmark_run_models row(s) have no resolvable pricing snapshot (orphaned pricing_snapshot_id) — investigate before re-running this migration.', unbackfilled_count;
  END IF;
END $$;

-- Toutes les lignes sont maintenant renseignées : les contraintes NOT NULL peuvent être appliquées
-- sans risque (jamais rendues nullable "définitivement" pour contourner le problème).
ALTER TABLE "benchmark_run_models"
  ALTER COLUMN "pricing_currency" SET NOT NULL,
  ALTER COLUMN "pricing_effective_from" SET NOT NULL,
  ALTER COLUMN "pricing_input_price_per_million_tokens" SET NOT NULL,
  ALTER COLUMN "pricing_output_price_per_million_tokens" SET NOT NULL;

-- AlterTable
ALTER TABLE "benchmark_runs" ADD COLUMN     "last_error_code" VARCHAR(60),
ADD COLUMN     "stale_recovery_attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "routing_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID,
    "tender_id" UUID,
    "analysis_id" UUID NOT NULL,
    "prompt_key" VARCHAR(40) NOT NULL,
    "routing_policy_id" UUID,
    "routing_policy_version" INTEGER,
    "recommended_ai_model_id" UUID,
    "primary_provider" VARCHAR(30) NOT NULL,
    "primary_model" VARCHAR(60) NOT NULL,
    "selected_provider" VARCHAR(30),
    "selected_model" VARCHAR(60),
    "fallback_level" INTEGER NOT NULL DEFAULT 0,
    "fallback_attempts" INTEGER NOT NULL DEFAULT 0,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "estimated_cost_amount" DECIMAL(14,6),
    "actual_cost_amount" DECIMAL(14,6),
    "currency" VARCHAR(3),
    "latency_ms" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "failure_reason" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "routing_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routing_decisions_organization_id_analysis_id_idx" ON "routing_decisions"("organization_id", "analysis_id");

-- CreateIndex
CREATE INDEX "routing_decisions_organization_id_prompt_key_created_at_idx" ON "routing_decisions"("organization_id", "prompt_key", "created_at");

-- CreateIndex
CREATE INDEX "benchmark_runs_status_updated_at_idx" ON "benchmark_runs"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint (même motif que le reste du module — jamais une chaîne libre non contrôlée).
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_status_check" CHECK ("status" IN ('IN_PROGRESS', 'SUCCEEDED', 'FAILED'));

-- Audit Codex P1-1 — garde-fou DB : au plus une RoutingPolicy ACTIVE par (organization_id,
-- prompt_key). Non exprimable dans le DSL Prisma (pas d'index partiel natif) : ajouté ici à la
-- main, jamais généré par `prisma migrate dev` — voir le commentaire sur le modèle RoutingPolicy
-- dans schema.prisma qui documente cette contrainte. `activateAtomically` (transaction applicative)
-- reste la première ligne de défense ; cet index est le filet de sécurité de dernier recours si
-- cette invariante était violée par un autre chemin (ex. deux activations concurrentes).
CREATE UNIQUE INDEX "routing_policies_org_prompt_key_active_key" ON "routing_policies"("organization_id", "prompt_key") WHERE "status" = 'ACTIVE';
