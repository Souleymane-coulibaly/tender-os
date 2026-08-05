export { SubmissionModule } from "./submission.module";

// Réexportés pour Sprint 9 (Cockpit) — vue LECTURE SEULE du statut de dépôt, jamais une seconde
// écriture sur ces tables (même motif que `ListSubmissionPackagesUseCase`/
// `ListValidatedAdministrativeDocumentsForPackageUseCase`).
export { GetTenderSubmissionReadinessUseCase } from "./application/use-cases/get-tender-submission-readiness.use-case";
export type { GetTenderSubmissionReadinessQuery, TenderSubmissionReadinessResult } from "./application/use-cases/get-tender-submission-readiness.use-case";
export { ListTenderSubmissionsUseCase } from "./application/use-cases/list-tender-submissions.use-case";
export type { ListTenderSubmissionsQuery } from "./application/use-cases/list-tender-submissions.use-case";

export type { TenderSubmissionSummary, SubmissionProofSummary } from "./application/dtos";
export { SubmissionReadinessStatus } from "./application/use-cases/get-tender-submission-readiness.use-case";
export { TenderSubmissionStatus } from "./domain/tender-submission-status";
export { SubmissionPlatform, SUBMISSION_PLATFORM_LABELS } from "./domain/submission-platform";
