export { AdministrativeDossierModule } from "./administrative-dossier.module";

// Réexporté en LECTURE SEULE pour Sprint 8C Phase 2 (module `submission-package`) — même motif que
// `ListDeliverablesUseCase` réexporté pour `cockpit` : jamais un second accès direct aux
// repositories, jamais une écriture depuis submission-package.
export { ListValidatedAdministrativeDocumentsForPackageUseCase } from "./application/use-cases/list-validated-administrative-documents-for-package.use-case";
export type { AdministrativeDocumentForPackage, ListValidatedAdministrativeDocumentsForPackageQuery } from "./application/use-cases/list-validated-administrative-documents-for-package.use-case";

// Réexporté en LECTURE SEULE pour Sprint 14 (module `response-package`) — signal de présence
// groupement/sous-traitant déjà déclaré, jamais un second système de déclaration.
export { GetCandidateContextForPackageUseCase } from "./application/use-cases/get-candidate-context-for-package.use-case";
export type { CandidateContextForPackage, GetCandidateContextForPackageQuery } from "./application/use-cases/get-candidate-context-for-package.use-case";

// V2 Sprint 25 (Dashboard Premium — checklist d'activation) — réexporté pour `dashboard`, même
// motif ci-dessus : jamais un second accès direct au repository depuis dashboard.
export { HasAnyAdministrativeDocumentUseCase } from "./application/use-cases/has-any-administrative-document.use-case";
