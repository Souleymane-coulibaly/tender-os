import type { StoredDocumentReference } from "./stored-document-reference";

export type OfficeDocumentElementKind = "heading" | "paragraph" | "table" | "list";

export type OfficeDocumentElement = Readonly<{
  kind: OfficeDocumentElementKind;
  /** Texte brut de l'élément — pour "table", les lignes sont déjà aplaties en texte tabulaire
   *  simple (mission §10 : structure minimale conservée, jamais une chaîne brute unique pour tout
   *  le document). */
  text: string;
  /** Niveau de titre (1 = plus haut) — uniquement pour kind="heading". */
  level?: number | undefined;
}>;

export type OfficeExtractionResult = Readonly<{
  /** Ordre documentaire préservé (mission §10 "ordre documentaire"). */
  elements: readonly OfficeDocumentElement[];
  warnings: readonly string[];
}>;

/**
 * Extraction de documents bureautiques (DOCX — mission Sprint 3 §10). Conserve une structure
 * minimale (Section/Paragraph/Table/List) plutôt qu'une seule chaîne brute — suffisant pour la
 * future analyse IA sans reconstruire la mise en forme visuelle complète (limite documentée).
 */
export interface OfficeDocumentExtractor {
  extract(input: StoredDocumentReference): Promise<OfficeExtractionResult>;
}

export const OFFICE_DOCUMENT_EXTRACTOR = Symbol("OFFICE_DOCUMENT_EXTRACTOR");
