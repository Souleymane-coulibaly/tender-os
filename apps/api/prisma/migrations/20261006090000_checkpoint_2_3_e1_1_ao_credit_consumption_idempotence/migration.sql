-- Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 (AO CREDIT IDEMPOTENCE) — un Tender ne peut jamais
-- produire plus d'une ligne CONSUMPTION dans le ledger AO, quel que soit le nombre de tentatives
-- (retry, replace, multi-lot, resoumission après retrait). Même motif exact que l'index partiel déjà
-- posé pour REVERSAL (migration 20260814100000_v2_sprint22b_reversal_unique_index) — non
-- représentable via `@@unique` en Prisma faute de clause WHERE, posé à la main.
CREATE UNIQUE INDEX "ao_credit_ledger_entries_consumption_tender_unique"
  ON "ao_credit_ledger_entries"("organization_id", "tender_id")
  WHERE "type" = 'CONSUMPTION';
