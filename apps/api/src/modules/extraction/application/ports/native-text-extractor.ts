import type { StoredDocumentReference } from "./stored-document-reference";

export type NativeExtractionPage = Readonly<{
  pageNumber: number;
  text: string;
  characterCount: number;
}>;

export type NativeExtractionResult = Readonly<{
  pages: readonly NativeExtractionPage[];
  /** Métadonnées PDF disponibles (Title/Author/Producer...) — jamais garanties, jamais utilisées
   *  pour une décision métier, uniquement transmises telles quelles (mission Sprint 3 §8). */
  metadata: Readonly<Record<string, string>>;
  warnings: readonly string[];
}>;

/**
 * Extraction de texte natif (mission Sprint 3 §8) — PDF avec texte embarqué uniquement (voir
 * PdfInspector pour la décision en amont). Ne reconstruit jamais la mise en page visuelle
 * (tableaux, colonnes) : seul le flux de texte par page est garanti, dans l'ordre où le moteur
 * sous-jacent le restitue — limite documentée, jamais cachée.
 */
export interface NativeTextExtractor {
  extract(input: StoredDocumentReference): Promise<NativeExtractionResult>;
}

export const NATIVE_TEXT_EXTRACTOR = Symbol("NATIVE_TEXT_EXTRACTOR");
