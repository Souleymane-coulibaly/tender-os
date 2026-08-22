-- Checkpoint TENDEROS-2.1-P2.3-E1.2 — mission "1 Pass AO = 1 Tender / 1 AO" : un Pass AVAILABLE ne
-- doit plus permettre de préparer plusieurs Tenders simultanément. Ajoute un état RESERVED
-- (application-layer only, aucun CHECK constraint sur `status`, VARCHAR libre déjà en place) entre
-- AVAILABLE et CONSUMED, distinct de la consommation commerciale finale.
ALTER TABLE "organization_pass_purchases"
  ADD COLUMN "reserved_tender_id" UUID,
  ADD COLUMN "reserved_at" TIMESTAMP(3);

CREATE INDEX "organization_pass_purchases_reserved_tender_id_idx" ON "organization_pass_purchases"("reserved_tender_id");

-- Autorité RÉELLE de l'invariant "un Tender ne réserve jamais deux Pass simultanément" sous
-- concurrence (deux réservations concurrentes du MÊME Tender via deux Pass DIFFÉRENTS de la même
-- organisation) — non représentable via `@@unique` en Prisma faute de clause WHERE, même motif que
-- l'index déjà en place pour REVERSAL/CONSUMPTION sur `ao_credit_ledger_entries`.
CREATE UNIQUE INDEX "organization_pass_purchases_reserved_tender_unique"
  ON "organization_pass_purchases"("organization_id", "reserved_tender_id")
  WHERE "status" = 'RESERVED';
