export { CompanyProfileModule } from "./company-profile.module";
// Réexporté pour `subcontractors` (mission "ne jamais dupliquer une règle métier") — fonctions
// pures sans dépendance à ce module, même motif que `ClientPermission` réexporté par
// `client-portfolio`.
export { isValidFrenchVatNumber, isValidSiren, isValidSiret } from "./domain/french-company-identifiers";
