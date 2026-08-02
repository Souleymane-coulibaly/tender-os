-- Correctif audit Codex P1-002 — colonnes additives, nullables : le rapport financier (COST_REPORT)
-- référence explicitement une version Sprint 7 FIGÉE, jamais "la dernière estimation courante" par
-- défaut. Immuable côté domaine une fois posée (Deliverable.selectCostReportEstimate) — aucune
-- contrainte SQL supplémentaire nécessaire, l'invariant est applicatif (même motif que
-- approved_by/approved_at, migration 20260902100000_deliverable_approval).
ALTER TABLE "deliverables" ADD COLUMN "cost_report_pricing_estimate_id" UUID;
ALTER TABLE "deliverables" ADD COLUMN "cost_report_pricing_estimate_version_number" INTEGER;
ALTER TABLE "deliverables" ADD COLUMN "cost_report_selected_by" UUID;
ALTER TABLE "deliverables" ADD COLUMN "cost_report_selected_at" TIMESTAMP(3);
