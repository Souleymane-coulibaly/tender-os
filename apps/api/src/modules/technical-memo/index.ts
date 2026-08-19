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

// Checkpoint 2.1-P2.1-FIX-E — réexporté en LECTURE SEULE pour `validation`, même motif que les
// réexports ci-dessus : jamais un second accès direct aux repositories technical-memo.
export { GetTechnicalMemoRevisionFingerprintForTenderUseCase } from "./application/use-cases/get-technical-memo-revision-fingerprint-for-tender.use-case";

// Checkpoint 2.1-P2.1-FIX-F — réexportés pour `submission` (agrégateur final de readiness).
export { ListTechnicalMemosUseCase } from "./application/use-cases/list-technical-memos.use-case";
export type { ListTechnicalMemosQuery } from "./application/use-cases/list-technical-memos.use-case";
export { GetTechnicalMemoFreshnessUseCase } from "./application/use-cases/get-technical-memo-freshness.use-case";
export type { TechnicalMemoFreshnessResult } from "./application/use-cases/get-technical-memo-freshness.use-case";
export { TechnicalMemoFreshness } from "./domain/technical-memo-freshness";
