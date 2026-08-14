-- V2 Sprint 22 (billing, étape 22B) — AO Credit Ledger / Rollover / Quotas.
-- Additif uniquement, aucune donnée existante touchée. Deux tables :
--   - organization_ao_credit_balances : solde COURANT mutable, une ligne par organisation, utilisé
--     UNIQUEMENT pour un compare-and-set atomique sous concurrence réelle.
--   - ao_credit_ledger_entries : append-only, la seule source de vérité historique (mission §16).

CREATE TABLE "organization_ao_credit_balances" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_ao_credit_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_ao_credit_balances_organization_id_key" ON "organization_ao_credit_balances"("organization_id");

ALTER TABLE "organization_ao_credit_balances"
  ADD CONSTRAINT "organization_ao_credit_balances_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ao_credit_ledger_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "period" VARCHAR(7),
  "tender_id" UUID,
  "reason" TEXT,
  "actor_platform_administrator_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ao_credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ao_credit_ledger_entries_organization_id_created_at_idx" ON "ao_credit_ledger_entries"("organization_id", "created_at");
CREATE INDEX "ao_credit_ledger_entries_organization_id_type_idx" ON "ao_credit_ledger_entries"("organization_id", "type");
CREATE INDEX "ao_credit_ledger_entries_tender_id_idx" ON "ao_credit_ledger_entries"("tender_id");

-- Idempotence du grant mensuel (mission §17) — un seul GRANT par (organization_id, period), non
-- représentable via `@@unique` en Prisma (clause WHERE requise), même motif que
-- `ExternalTenderPromotion` (Sprint 17).
CREATE UNIQUE INDEX "ao_credit_ledger_entries_grant_period_unique"
  ON "ao_credit_ledger_entries"("organization_id", "period")
  WHERE "type" = 'GRANT';

ALTER TABLE "ao_credit_ledger_entries"
  ADD CONSTRAINT "ao_credit_ledger_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
