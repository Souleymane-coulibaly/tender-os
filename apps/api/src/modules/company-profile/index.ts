export { CompanyProfileModule } from "./company-profile.module";
// Réexporté pour `subcontractors` (mission "ne jamais dupliquer une règle métier") — fonctions
// pures sans dépendance à ce module, même motif que `ClientPermission` réexporté par
// `client-portfolio`.
export { isValidFrenchVatNumber, isValidSiren, isValidSiret } from "./domain/french-company-identifiers";

// V2 Sprint 5 (GO/NO-GO IA) — réexporté UNIQUEMENT pour `opportunity` (scoring Niveau 1/Niveau 2,
// lecture seule). Voir le commentaire de `company-profile.module.ts` pour la justification.
export { GetCompanyProfileUseCase, CompanyProfileCategoryStatus } from "./application/use-cases/get-company-profile.use-case";
export type { CompanyProfileSummary } from "./application/use-cases/get-company-profile.use-case";
export { TemporalValidityStatus } from "./domain/enums";

// Checkpoint TENDEROS-2.1-CCV2-E — point d'accès canonique UNIQUE aux capacités candidate,
// réexporté pour les consommateurs métier (checklist-intelligence, opportunity, technical-memo,
// administrative-dossier). Jamais un second chemin de lecture ad hoc par consommateur.
export { CandidateCapabilitiesSource, ResolveCandidateCapabilitiesUseCase, satisfiesRequirementNow } from "./application/use-cases/resolve-candidate-capabilities.use-case";
export type { CandidateCapabilitiesSummary, CandidateDocumentCapability } from "./application/use-cases/resolve-candidate-capabilities.use-case";
