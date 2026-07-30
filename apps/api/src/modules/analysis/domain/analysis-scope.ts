import { InvalidAnalysisScopeError } from "./errors";

/**
 * Périmètre d'un job d'analyse (mission Sprint 4.1) — `DOCUMENT` analyse un unique document déjà
 * extrait (corpus via `GetDocumentAnalysisInputUseCase`, module Extraction) ; `TENDER` analyse le
 * Tender dans son ensemble. Sprint 4.1 ne fournit aucun contrat d'agrégation de corpus
 * multi-documents (hors périmètre, Sprint 4.2) : un job `TENDER` ne consomme donc qu'une entrée
 * technique minimale (identifiants), jamais un résumé métier du dossier.
 */
export const AnalysisScope = {
  Document: "DOCUMENT",
  Tender: "TENDER",
} as const;

export type AnalysisScope = (typeof AnalysisScope)[keyof typeof AnalysisScope];

export function isAnalysisScope(value: string): value is AnalysisScope {
  return Object.values(AnalysisScope).includes(value as AnalysisScope);
}

export function parseAnalysisScope(value: string): AnalysisScope {
  if (!isAnalysisScope(value)) {
    throw new InvalidAnalysisScopeError(value);
  }
  return value;
}
