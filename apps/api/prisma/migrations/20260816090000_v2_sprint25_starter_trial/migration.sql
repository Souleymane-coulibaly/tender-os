-- V2 Sprint 25 (activation, Trial Starter 14 jours) — additif uniquement, aucune donnée existante
-- touchée.
--
--   1. organization_subscriptions.trial_ends_at — fin de la période d'essai Stripe, autoritaire
--      côté serveur/Stripe (mission §14).
--   2. trial_reminder_records — dédup des rappels J7/J11/J13 (mission §93), même motif que
--      l'idempotence du grant mensuel AO (22B).
--   3. Idempotence du grant Trial (mission §16/§18) — au plus UNE entrée TRIAL_GRANT par
--      organisation, JAMAIS par mois (contrairement au GRANT mensuel) : index unique partiel,
--      même motif que "ao_credit_ledger_entries_grant_period_unique" (22B).

ALTER TABLE "organization_subscriptions" ADD COLUMN "trial_ends_at" TIMESTAMP(3);

CREATE TABLE "trial_reminder_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "days_remaining" INTEGER NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trial_reminder_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_reminder_records_organization_id_days_remaining_key" ON "trial_reminder_records"("organization_id", "days_remaining");

ALTER TABLE "trial_reminder_records"
  ADD CONSTRAINT "trial_reminder_records_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ao_credit_ledger_entries_trial_grant_unique"
  ON "ao_credit_ledger_entries"("organization_id")
  WHERE "type" = 'TRIAL_GRANT';
