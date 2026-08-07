export { CompanyProfileModule } from "./company-profile.module";
// Réexporté pour `subcontractors` (mission "ne jamais dupliquer une règle métier") — fonctions
// pures sans dépendance à ce module, même motif que `ClientPermission` réexporté par
// `client-portfolio`.
export { isValidFrenchVatNumber, isValidSiren, isValidSiret } from "./domain/french-company-identifiers";

// V2 Sprint 5 (GO/NO-GO IA) — réexporté UNIQUEMENT pour `opportunity` (scoring Niveau 1/Niveau 2,
// lecture seule). Voir le commentaire de `company-profile.module.ts` pour la justification.
export { GetCompanyProfileUseCase } from "./application/use-cases/get-company-profile.use-case";
export type { CompanyProfileSummary, CompanyProfileCategoryStatus } from "./application/use-cases/get-company-profile.use-case";
export { TemporalValidityStatus } from "./domain/enums";
