-- Mission Sprint 8A.1 §15 — colonnes additives, nullables : le statut APPROVED d'un livrable
-- structuré (Mémoire technique/Synthèse exécutive) est déclenché explicitement par
-- ApproveDeliverableUseCase, jamais déduit automatiquement. Le statut EXPORTED reste calculé
-- dynamiquement depuis les exports FINAUX déjà COMPLETED du Sprint 8A — aucune colonne
-- supplémentaire pour cela (jamais un second stockage figé qui pourrait diverger).
ALTER TABLE "deliverables" ADD COLUMN "approved_by" UUID;
ALTER TABLE "deliverables" ADD COLUMN "approved_at" TIMESTAMP(3);
