export { DceModule } from "./dce.module";
export type { DceSummary, DceDocumentSummary } from "./application/dtos";

// Réexportés uniquement pour un usage système interne (mission Sprint 3 — Extraction fait
// progresser DceDocument.processingStatus vers READY_FOR_ANALYSIS en miroir d'une extraction
// réussie, jamais via un use case HTTP protégé par le RBAC d'un utilisateur).
export { DCE_DOCUMENT_REPOSITORY } from "./application/ports/dce-document.repository";
export type { DceDocumentRepository } from "./application/ports/dce-document.repository";
export { DceDocumentProcessingStatus, determineDceDocumentProcessingStatus } from "./domain/dce-document-processing-status";

// Réexporté pour permettre à Extraction de résoudre le DCE d'un Tender (chaîne d'autorisation
// mission Sprint 3 §17 "Tender → DCE → document → permission") sans dupliquer cette résolution —
// même motif que les réexports déjà pratiqués par Documents/Tenders.
export { DCE_REPOSITORY } from "./application/ports/dce.repository";
export type { DceRepository } from "./application/ports/dce.repository";

// Réexportés pour Sprint 8A.2 (correction "aucun déclencheur d'extraction") —
// AutoTriggerDocumentExtractionUseCase (module Extraction) doit pouvoir créer un Dce/DceDocument
// manquant avec exactement la même logique déterministe que l'import DCE normal
// (ImportDceFilesUseCase), jamais une seconde implémentation divergente de la classification ou
// du statut de préparation.
export { Dce } from "./domain/dce.aggregate";
export { DceId } from "./domain/dce-id.value-object";
export { DceDocument } from "./domain/dce-document.entity";
export { DceDocumentCategory } from "./domain/dce-document-category";
export { classifyDceDocument } from "./domain/dce-document-classifier";

// Réexportés en LECTURE SEULE pour Sprint 8A.2 (module `cockpit`) — synthèse de l'état du DCE
// d'un Tender pour la vue d'ensemble, jamais un second accès direct aux repositories.
export { GetDceUseCase } from "./application/use-cases/get-dce.use-case";
export type { GetDceByTenderQuery } from "./application/use-cases/get-dce.use-case";
export { ListDceDocumentsUseCase } from "./application/use-cases/list-dce-documents.use-case";
export type { ListDceDocumentsQuery } from "./application/use-cases/list-dce-documents.use-case";
export { DceNotFoundError } from "./domain/errors";
