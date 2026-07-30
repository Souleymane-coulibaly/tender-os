export { ExtractionModule } from "./extraction.module";

// Correction P1-04 — seul point d'entrée applicatif que le futur module d'analyse IA (Sprint 4)
// doit utiliser pour lire le corpus de chunks d'un document déjà extrait : jamais Prisma, jamais
// un repository infrastructure, jamais une table SQL, jamais un contrôleur HTTP interne de ce
// module — même motif que les réexports déjà pratiqués par Tenders/DCE/Documents.
export { GetDocumentAnalysisInputUseCase } from "./application/use-cases/get-document-analysis-input.use-case";
export type {
  DocumentAnalysisChunk,
  DocumentAnalysisInput,
  GetDocumentAnalysisInputQuery,
} from "./application/use-cases/get-document-analysis-input.use-case";

// Contrat public Sprint 5 — seul point d'entrée que le module Knowledge Base doit utiliser pour
// extraire le texte/chunks d'un document déjà stocké (module Documents) : jamais lié à un
// Tender/DCE, jamais un accès direct aux tables internes de ce module (DocumentExtraction/
// ExtractionChunk, intrinsèquement FK-ées à un DCE) — même motif que GetDocumentAnalysisInputUseCase
// pour le module Analysis (Sprint 4).
export { ExtractDocumentContentUseCase } from "./application/use-cases/extract-document-content.use-case";
export type {
  ExtractDocumentContentCommand,
  ExtractDocumentContentResult,
  ExtractedDocumentContentChunk,
} from "./application/use-cases/extract-document-content.use-case";
