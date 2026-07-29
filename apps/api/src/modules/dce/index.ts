export { DceModule } from "./dce.module";
export type { DceSummary, DceDocumentSummary } from "./application/dtos";

// Réexportés uniquement pour un usage système interne (mission Sprint 3 — Extraction fait
// progresser DceDocument.processingStatus vers READY_FOR_ANALYSIS en miroir d'une extraction
// réussie, jamais via un use case HTTP protégé par le RBAC d'un utilisateur).
export { DCE_DOCUMENT_REPOSITORY } from "./application/ports/dce-document.repository";
export type { DceDocumentRepository } from "./application/ports/dce-document.repository";
export { DceDocumentProcessingStatus } from "./domain/dce-document-processing-status";

// Réexporté pour permettre à Extraction de résoudre le DCE d'un Tender (chaîne d'autorisation
// mission Sprint 3 §17 "Tender → DCE → document → permission") sans dupliquer cette résolution —
// même motif que les réexports déjà pratiqués par Documents/Tenders.
export { DCE_REPOSITORY } from "./application/ports/dce.repository";
export type { DceRepository } from "./application/ports/dce.repository";
