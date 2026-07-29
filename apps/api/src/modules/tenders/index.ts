export { TendersModule } from "./tenders.module";
export type { TenderSummary } from "./application/dtos";
// Réexporté uniquement pour permettre au module Documents de vérifier qu'un Tender existe et
// appartient à l'organisation active avant d'y associer un document (AttachDocumentToTender/
// ListTenderDocuments) — même motif que les réexports déjà pratiqués par Memberships.
export { GetTenderUseCase } from "./application/use-cases/get-tender.use-case";
export type { GetTenderQuery, GetTenderResult } from "./application/use-cases/get-tender.use-case";

// Réexporté uniquement pour un usage système interne (mission Sprint 3 — Extraction lit
// `Tender.language` comme simple indication pour l'OCR, jamais comme vérité absolue) — jamais un
// contournement de la permission Tenders pour un acteur utilisateur. Même motif que les réexports
// internes déjà pratiqués par Documents/DCE (`GetTenderUseCase` reste RBAC-gated : une opération
// système ne doit jamais dépendre d'un rôle d'acteur qui n'existe pas dans ce contexte).
export { TENDER_REPOSITORY } from "./application/ports/tender.repository";
export type { TenderRepository } from "./application/ports/tender.repository";

