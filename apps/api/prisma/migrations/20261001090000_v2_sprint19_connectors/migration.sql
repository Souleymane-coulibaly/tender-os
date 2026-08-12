-- CreateTable
CREATE TABLE "external_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "external_account_id" VARCHAR(200) NOT NULL,
    "external_tenant_id" VARCHAR(200),
    "external_account_label" VARCHAR(300),
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "last_refresh_at" TIMESTAMP(3),
    "last_successful_sync_at" TIMESTAMP(3),
    "last_error" VARCHAR(500),
    "allowed_client_account_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID NOT NULL,
    "connected_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,

    CONSTRAINT "external_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_flow_states" (
    "id" UUID NOT NULL,
    "state" VARCHAR(128) NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "code_verifier" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "oauth_flow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_configurations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "client_account_id" UUID,
    "tender_id" UUID,
    "remote_container_id" VARCHAR(300) NOT NULL,
    "remote_folder_id" VARCHAR(300) NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conflict_policy" VARCHAR(20) NOT NULL DEFAULT 'NEEDS_REVIEW',
    "last_sync_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_synced_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "milestone_id" UUID,
    "external_event_id" VARCHAR(300) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "calendar_synced_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_connections_id_organization_id_key" ON "external_connections"("id", "organization_id");
CREATE INDEX "external_connections_organization_id_idx" ON "external_connections"("organization_id");

-- Au plus une connexion PENDING/ACTIVE/REAUTH_REQUIRED par (organizationId, provider) — mission
-- §4/§47. Une connexion REVOKED (soft, jamais supprimée) n'est jamais comptée ici : une
-- reconnexion crée une NOUVELLE ligne, l'historique reste consultable (index partiel, même motif
-- que ExternalTenderPromotion Sprint 17).
CREATE UNIQUE INDEX "external_connections_org_provider_active_uidx" ON "external_connections"("organization_id", "provider") WHERE "status" IN ('PENDING', 'ACTIVE', 'REAUTH_REQUIRED');

CREATE UNIQUE INDEX "oauth_flow_states_state_key" ON "oauth_flow_states"("state");
CREATE INDEX "oauth_flow_states_expires_at_idx" ON "oauth_flow_states"("expires_at");

CREATE UNIQUE INDEX "sync_configurations_id_organization_id_key" ON "sync_configurations"("id", "organization_id");
CREATE INDEX "sync_configurations_organization_id_connection_id_idx" ON "sync_configurations"("organization_id", "connection_id");

CREATE UNIQUE INDEX "calendar_synced_events_id_organization_id_key" ON "calendar_synced_events"("id", "organization_id");
CREATE INDEX "calendar_synced_events_organization_id_tender_id_idx" ON "calendar_synced_events"("organization_id", "tender_id");

-- AddForeignKey
ALTER TABLE "sync_configurations" ADD CONSTRAINT "sync_configurations_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "external_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_synced_events" ADD CONSTRAINT "calendar_synced_events_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "external_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
