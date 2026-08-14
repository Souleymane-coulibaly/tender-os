-- V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02) — dédup des alertes de seuil
-- d'usage (users/Chat IA/stockage, 80%/100%) : la contrainte unique
-- (organization_id, quota_type, threshold, period_key) est la SEULE autorité réelle de
-- l'idempotence (voir GetOrganizationUsageUseCase). Additif uniquement.

CREATE TABLE "billing_quota_alert_states" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quota_type" VARCHAR(30) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "period_key" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_quota_alert_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_quota_alert_states_organization_id_quota_type_thr_key" ON "billing_quota_alert_states"("organization_id", "quota_type", "threshold", "period_key");
