export { TechnicalMemoModule } from "./technical-memo.module";

// Réexporté en LECTURE SEULE pour Sprint 14 (module `response-package`) — même motif que
// `ListValidatedAdministrativeDocumentsForPackageUseCase` réexporté par `administrative-dossier`
// (Sprint 8C Phase 2) : jamais un second accès direct aux repositories, jamais une écriture depuis
// response-package.
export { ListValidatedTechnicalMemosForPackageUseCase } from "./application/use-cases/list-validated-technical-memos-for-package.use-case";
export type { TechnicalMemoForPackage, ListValidatedTechnicalMemosForPackageQuery } from "./application/use-cases/list-validated-technical-memos-for-package.use-case";

// Réexporté en LECTURE SEULE pour Sprint 18 (module `workspace`) — même motif ci-dessus : valider
// qu'une ApprovalRequest cible bien une TechnicalMemoSectionRevision appartenant au Tender de la
// demande, jamais un accès Prisma direct depuis workspace.
export { GetSectionRevisionTenderRefForApprovalUseCase } from "./application/use-cases/get-section-revision-tender-ref-for-approval.use-case";
export type { SectionRevisionTenderRef } from "./application/use-cases/get-section-revision-tender-ref-for-approval.use-case";
