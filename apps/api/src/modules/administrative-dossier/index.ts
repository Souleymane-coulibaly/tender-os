export { AdministrativeDossierModule } from "./administrative-dossier.module";

// Réexporté en LECTURE SEULE pour Sprint 8C Phase 2 (module `submission-package`) — même motif que
// `ListDeliverablesUseCase` réexporté pour `cockpit` : jamais un second accès direct aux
// repositories, jamais une écriture depuis submission-package.
export { ListValidatedAdministrativeDocumentsForPackageUseCase } from "./application/use-cases/list-validated-administrative-documents-for-package.use-case";
export type { AdministrativeDocumentForPackage, ListValidatedAdministrativeDocumentsForPackageQuery } from "./application/use-cases/list-validated-administrative-documents-for-package.use-case";
