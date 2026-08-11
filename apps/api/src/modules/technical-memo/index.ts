export { TechnicalMemoModule } from "./technical-memo.module";

// Réexporté en LECTURE SEULE pour Sprint 14 (module `response-package`) — même motif que
// `ListValidatedAdministrativeDocumentsForPackageUseCase` réexporté par `administrative-dossier`
// (Sprint 8C Phase 2) : jamais un second accès direct aux repositories, jamais une écriture depuis
// response-package.
export { ListValidatedTechnicalMemosForPackageUseCase } from "./application/use-cases/list-validated-technical-memos-for-package.use-case";
export type { TechnicalMemoForPackage, ListValidatedTechnicalMemosForPackageQuery } from "./application/use-cases/list-validated-technical-memos-for-package.use-case";
