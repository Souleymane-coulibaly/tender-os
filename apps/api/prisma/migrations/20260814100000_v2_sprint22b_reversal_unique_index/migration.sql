-- V2 Sprint 22 (billing, étape 22B, correctif audit Codex P1-01) — au plus une entrée REVERSAL
-- par (organization_id, tender_id), non représentable via `@@unique` en Prisma (clause WHERE
-- requise), même motif que `ao_credit_ledger_entries_grant_period_unique` (migration précédente)
-- et `ExternalTenderPromotion` (Sprint 17). Sans cette contrainte, deux appels
-- `reverseConsumption` réellement simultanés pouvaient tous deux lire "pas encore reversé" avant
-- que l'un des deux n'écrive, recréditant deux fois le même Tender.

CREATE UNIQUE INDEX "ao_credit_ledger_entries_reversal_tender_unique"
  ON "ao_credit_ledger_entries"("organization_id", "tender_id")
  WHERE "type" = 'REVERSAL';
