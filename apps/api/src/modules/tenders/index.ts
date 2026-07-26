export { TendersModule } from "./tenders.module";
export type { TenderSummary } from "./application/dtos";
// Réexporté uniquement pour permettre au module Documents de vérifier qu'un Tender existe et
// appartient à l'organisation active avant d'y associer un document (AttachDocumentToTender/
// ListTenderDocuments) — même motif que les réexports déjà pratiqués par Memberships.
export { GetTenderUseCase } from "./application/use-cases/get-tender.use-case";
export type { GetTenderQuery, GetTenderResult } from "./application/use-cases/get-tender.use-case";

