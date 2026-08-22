-- Checkpoint TENDEROS-2.1-P2.3-E3, mission §28 (OBSERVABILITÉ) — table additive uniquement, aucun
-- DROP, aucune modification de table existante, aucun backfill (aucune donnée historique n'existe
-- pour ces exécutions, jamais inventée). Voir schema.prisma pour la justification complète de la
-- granularité (organizationId, source).
CREATE TABLE "market_source_sync_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL,
    "opportunities_fetched" INTEGER NOT NULL DEFAULT 0,
    "opportunities_created" INTEGER NOT NULL DEFAULT 0,
    "opportunities_updated" INTEGER NOT NULL DEFAULT 0,
    "matches_created" INTEGER NOT NULL DEFAULT 0,
    "notifications_created" INTEGER NOT NULL DEFAULT 0,
    "error_summary" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_source_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_source_sync_runs_organization_id_source_started_at_idx"
    ON "market_source_sync_runs"("organization_id", "source", "started_at");
