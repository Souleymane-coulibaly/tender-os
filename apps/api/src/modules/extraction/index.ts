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
