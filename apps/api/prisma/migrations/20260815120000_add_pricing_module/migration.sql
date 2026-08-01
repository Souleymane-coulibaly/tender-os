-- Sprint 7 (AI Pricing & Prévisions) — additive uniquement, aucune table existante modifiée au-delà
-- du commentaire de doc sur Generation.estimated_cost_amount (déjà appliqué en TypeScript via
-- schema.prisma, sans impact SQL). Trois tables : PricingEstimate (en-tête stable), PricingEstimate
-- Version (une ligne PAR VERSION, jamais réécrite), PricingBreakdownLine (détail d'une version).

-- CreateTable
CREATE TABLE "pricing_estimates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID,
    "tender_id" UUID,
    "type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "current_version_id" UUID,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "pricing_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_estimate_versions" (
    "id" UUID NOT NULL,
    "estimate_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "amount_value" DECIMAL(14,6) NOT NULL,
    "amount_currency" VARCHAR(3) NOT NULL,
    "assumptions" JSONB NOT NULL,
    "disclaimer_version" INTEGER NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMP(3),
    "recalculation_reason" VARCHAR(500),

    CONSTRAINT "pricing_estimate_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_breakdown_lines" (
    "id" UUID NOT NULL,
    "estimate_version_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(14,6),
    "unit" VARCHAR(30),
    "unit_price_value" DECIMAL(14,6),
    "unit_price_currency" VARCHAR(3),
    "amount_value" DECIMAL(14,6) NOT NULL,
    "amount_currency" VARCHAR(3) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "pricing_breakdown_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_estimates_organization_id_tender_id_idx" ON "pricing_estimates"("organization_id", "tender_id");

-- CreateIndex
CREATE INDEX "pricing_estimates_organization_id_client_account_id_idx" ON "pricing_estimates"("organization_id", "client_account_id");

-- CreateIndex
CREATE INDEX "pricing_estimates_organization_id_type_idx" ON "pricing_estimates"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_estimates_id_organization_id_key" ON "pricing_estimates"("id", "organization_id");

-- CreateIndex
CREATE INDEX "pricing_estimate_versions_organization_id_idx" ON "pricing_estimate_versions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_estimate_versions_estimate_id_version_key" ON "pricing_estimate_versions"("estimate_id", "version");

-- CreateIndex
CREATE INDEX "pricing_breakdown_lines_estimate_version_id_idx" ON "pricing_breakdown_lines"("estimate_version_id");

-- AddForeignKey
ALTER TABLE "pricing_estimates" ADD CONSTRAINT "pricing_estimates_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_estimates" ADD CONSTRAINT "pricing_estimates_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_estimate_versions" ADD CONSTRAINT "pricing_estimate_versions_estimate_id_organization_id_fkey" FOREIGN KEY ("estimate_id", "organization_id") REFERENCES "pricing_estimates"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_breakdown_lines" ADD CONSTRAINT "pricing_breakdown_lines_estimate_version_id_fkey" FOREIGN KEY ("estimate_version_id") REFERENCES "pricing_estimate_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (même motif que Generation.status/PromptVersion.status — jamais une chaîne
-- libre pour un catalogue fermé, non exprimable directement dans le DSL Prisma).
ALTER TABLE "pricing_estimates" ADD CONSTRAINT "pricing_estimates_type_check" CHECK ("type" IN (
  'AI_TECHNICAL_COST', 'GENERATION_ESTIMATE', 'TENDER_ESTIMATE', 'CLIENT_COST_SUMMARY',
  'ORGANIZATION_COST_SUMMARY', 'PRODUCTION_ESTIMATE', 'COMMERCIAL_PREVIEW'
));

ALTER TABLE "pricing_estimates" ADD CONSTRAINT "pricing_estimates_status_check" CHECK ("status" IN (
  'DRAFT', 'CALCULATED', 'PARTIAL', 'UNKNOWN', 'SUPERSEDED', 'ARCHIVED'
));

ALTER TABLE "pricing_estimate_versions" ADD CONSTRAINT "pricing_estimate_versions_status_check" CHECK ("status" IN (
  'DRAFT', 'CALCULATED', 'PARTIAL', 'UNKNOWN', 'SUPERSEDED'
));

ALTER TABLE "pricing_breakdown_lines" ADD CONSTRAINT "pricing_breakdown_lines_source_check" CHECK ("source" IN ('ACTUAL', 'ESTIMATED'));

-- Mission Sprint 7 §"aucune agrégation directe entre devises différentes" — chaque ligne de
-- breakdown doit partager la devise de sa version parente ; imposé applicativement (domaine
-- `CostBreakdownLine`) ET vérifié ici pour l'unité de prix quand elle est renseignée.
ALTER TABLE "pricing_breakdown_lines" ADD CONSTRAINT "pricing_breakdown_lines_unit_price_currency_check" CHECK (
  "unit_price_currency" IS NULL OR "unit_price_currency" = "amount_currency"
);
