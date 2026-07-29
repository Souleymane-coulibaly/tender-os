import type { DocumentExtractionSummary } from "../../application/dtos";

// Passe-plat volontaire : DocumentExtractionSummary n'expose déjà jamais le contenu extrait ni
// aucun chemin de stockage (même règle que Documents/DCE, conception §M).
export function presentDocumentExtraction(extraction: DocumentExtractionSummary): DocumentExtractionSummary {
  return { ...extraction };
}
