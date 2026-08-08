export { SubcontractorsModule } from "./subcontractors.module";

// V2 Sprint 6 (correctif audit Codex P2) — pont @Global() fournissant l'implémentation réelle du
// port `SubcontractorSubjectValidator` (module `tenders`), à importer UNE FOIS par `AppModule` —
// même motif que `ExtractionTriggerBridgeModule`/`RoutingPolicyBridgeModule`.
export { SubcontractorSubjectValidationBridgeModule } from "./infrastructure/subcontractor-subject-validation-bridge.module";

// V2 Sprint 6 — réexportés UNIQUEMENT pour le nouveau module `checklist-intelligence`
// (rapprochement documentaire d'un ChecklistItem dont le sujet est un SUBCONTRACTOR explicitement
// rattaché, §15-17), lecture seule — aucune écriture ne passe par ces exports.
export { GetSubcontractorProfileUseCase } from "./application/use-cases/subcontractor-profile.use-cases";
export { ListSubcontractorCertificationsUseCase, ListSubcontractorInsurancesUseCase } from "./application/use-cases/subcontractor-satellite.use-cases";
export type { SubcontractorProfileRecord, SubcontractorCertificationRecord, SubcontractorInsuranceRecord } from "./application/dtos";
export { SubcontractorProfileNotFoundError } from "./domain/errors";
