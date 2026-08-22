-- Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §9 (CONTRAINTES DB) — Codex a relevé que l'unicité
-- RESERVED est protégée par un index unique partiel réel (migration
-- 20261007090000_checkpoint_2_3_e1_2_pass_reservation), mais pas l'équivalent CONSUMED : rien
-- n'empêchait structurellement DEUX lignes OrganizationPassPurchase d'être CONSUMED pour le MÊME
-- tenderId de la même organisation (en pratique déjà empêché par le compare-and-set applicatif de
-- `consumeForTender`/`ConsumeAoCreditUseCase`, mais jamais par une contrainte DB — renforcement
-- défense-en-profondeur, additif uniquement, aucun DROP, aucun reset).
CREATE UNIQUE INDEX "organization_pass_purchases_consumed_tender_unique"
  ON "organization_pass_purchases"("organization_id", "consumed_tender_id")
  WHERE "status" = 'CONSUMED';
