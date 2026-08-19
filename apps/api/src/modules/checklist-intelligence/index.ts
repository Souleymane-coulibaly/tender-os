export { ChecklistIntelligenceModule } from "./checklist-intelligence.module";

// Checkpoint 2.1-P2.1-FIX-F — réexporté en LECTURE SEULE pour `submission` (agrégateur final de
// readiness) — ce module n'avait encore aucun barrel `index.ts` (jamais consommé par un autre
// module jusqu'ici, voir le commentaire de `checklist-intelligence.module.ts` : "modules qui
// orchestrent... sans jamais être importés par eux").
export { GetChecklistFreshnessUseCase } from "./application/use-cases/get-checklist-freshness.use-case";
export type { ChecklistFreshnessResult } from "./application/use-cases/get-checklist-freshness.use-case";
