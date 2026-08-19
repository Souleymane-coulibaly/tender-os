export { ValidationModule } from "./validation.module";

export { GetReadinessStatusUseCase } from "./application/use-cases/get-readiness-status.use-case";
export type { ReadinessStatusResult } from "./application/use-cases/get-readiness-status.use-case";
// Réexporté pour Sprint 8A.1 (Deliverables) — vue LECTURE SEULE "Rapport de validation" (mission
// §14 "contrôles/blocages/avertissements/anomalies/résolutions/approbateur/date"), jamais une
// seconde écriture sur ces tables.
export { GetValidationRunUseCase } from "./application/use-cases/get-validation-run.use-case";
export type { GetValidationRunQuery } from "./application/use-cases/get-validation-run.use-case";

export { FINAL_APPROVAL_REPOSITORY } from "./application/ports/final-approval.repository";
export type { FinalApprovalRepository } from "./application/ports/final-approval.repository";
export { VALIDATION_RUN_REPOSITORY } from "./application/ports/validation-run.repository";
export type { ValidationRunRepository } from "./application/ports/validation-run.repository";

export type { FinalApprovalSummary, ValidationRunSummary } from "./application/dtos";
export { ReadinessStatus } from "./domain/readiness-status";
export { FinalApprovalStatus } from "./domain/final-approval.aggregate";

// Checkpoint 2.1-P2.1-FIX-F — réexporté pour `submission` (agrégateur final de readiness).
export { GetValidationFreshnessUseCase } from "./application/use-cases/get-validation-freshness.use-case";
export type { ValidationFreshnessResult } from "./application/use-cases/get-validation-freshness.use-case";
export { ValidationFreshness } from "./domain/validation-freshness";
