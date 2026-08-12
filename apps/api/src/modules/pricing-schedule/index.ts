export { PricingScheduleModule } from "./pricing-schedule.module";

// Réexporté en LECTURE SEULE pour Sprint 14 (module `response-package`) — même motif que
// `ListValidatedAdministrativeDocumentsForPackageUseCase`/`ListValidatedTechnicalMemosForPackageUseCase`.
export { ListFinalFilesForPackageUseCase } from "./application/use-cases/list-final-files-for-package.use-case";
export type { PricingScheduleFinalFileForPackage, ListFinalFilesForPackageQuery } from "./application/use-cases/list-final-files-for-package.use-case";

// Réexporté en LECTURE SEULE pour Sprint 18 (module `workspace`) — même motif ci-dessus : valider
// qu'une ApprovalRequest cible bien une PricingScheduleVersion appartenant au Tender de la demande
// et déjà VALIDATED, jamais un accès Prisma direct depuis workspace.
export { GetVersionTenderRefForApprovalUseCase } from "./application/use-cases/get-version-tender-ref-for-approval.use-case";
export type { PricingScheduleVersionTenderRef } from "./application/use-cases/get-version-tender-ref-for-approval.use-case";
export { PricingScheduleVersionStatus } from "./domain/enums";
