-- Sprint 21 (hardening) — mission PARTIE F : bail de synchronisation (organization_id, source)
-- pour éviter un travail dupliqué entre plusieurs instances (MarketSourceSyncWorker était le seul
-- worker sans claim/lock). Additif uniquement, aucune donnée existante touchée.

CREATE TABLE "market_source_sync_leases" (
  "organization_id" UUID NOT NULL,
  "source" VARCHAR(40) NOT NULL,
  "locked_until" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "market_source_sync_leases_pkey" PRIMARY KEY ("organization_id", "source")
);
