-- V2 Sprint 22 (billing, étape 22A) — Catalogue / Pass / Plans / Entitlements.
-- Additif uniquement, aucune donnée existante touchée. Trois tables :
--   - organization_subscriptions : au plus une ligne par organisation, l'état COURANT de
--     l'abonnement récurrent (STARTER/BUSINESS/ENTERPRISE) ; jamais PASS ni CONSEIL.
--   - organization_pass_purchases : une ligne PAR ACHAT Pass (jamais un solde mutable unique) ;
--     sert à la fois de ledger d'achat et d'état de consommation (mission §6/§7/§36).
--   - entitlement_overrides : dérogation Platform-Admin-only (correctif audit Codex P1-02).

CREATE TABLE "organization_subscriptions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "plan_tier" VARCHAR(30) NOT NULL,
  "billing_interval" VARCHAR(20) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "stripe_customer_id" VARCHAR(120),
  "stripe_subscription_id" VARCHAR(120),
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");
CREATE UNIQUE INDEX "organization_subscriptions_stripe_subscription_id_key" ON "organization_subscriptions"("stripe_subscription_id");
CREATE INDEX "organization_subscriptions_plan_tier_status_idx" ON "organization_subscriptions"("plan_tier", "status");

ALTER TABLE "organization_subscriptions"
  ADD CONSTRAINT "organization_subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "organization_pass_purchases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "external_reference" VARCHAR(160) NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "consumed_tender_id" UUID,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_pass_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_pass_purchases_external_reference_key" ON "organization_pass_purchases"("external_reference");
CREATE INDEX "organization_pass_purchases_organization_id_status_idx" ON "organization_pass_purchases"("organization_id", "status");
CREATE INDEX "organization_pass_purchases_consumed_tender_id_idx" ON "organization_pass_purchases"("consumed_tender_id");

ALTER TABLE "organization_pass_purchases"
  ADD CONSTRAINT "organization_pass_purchases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "entitlement_overrides" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "feature" VARCHAR(60),
  "feature_enabled" BOOLEAN,
  "quota" VARCHAR(60),
  "quota_limit_value" INTEGER,
  "quota_unlimited" BOOLEAN,
  "reason" TEXT NOT NULL,
  "created_by_platform_administrator_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "revoked_by_platform_administrator_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entitlement_overrides_organization_id_feature_idx" ON "entitlement_overrides"("organization_id", "feature");
CREATE INDEX "entitlement_overrides_organization_id_quota_idx" ON "entitlement_overrides"("organization_id", "quota");

ALTER TABLE "entitlement_overrides"
  ADD CONSTRAINT "entitlement_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
