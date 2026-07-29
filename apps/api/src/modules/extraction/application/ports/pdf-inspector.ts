import type { StoredDocumentReference } from "./stored-document-reference";

/**
 * Inspection réelle du contenu d'un PDF (mission Sprint 3 §7) — jamais une décision sur la seule
 * extension : c'est ce résultat qui permet de trancher entre NATIVE_TEXT et OCR pour un PDF donné.
 */
export type PdfInspectionResult = Readonly<{
  pageCount: number;
  hasEmbeddedText: boolean;
  /** Nombre de pages sans texte embarqué détectable — indice d'un PDF scanné ou mixte. */
  estimatedScannedPageCount: number;
  encrypted: boolean;
  corrupted: boolean;
}>;

export interface PdfInspector {
  inspect(input: StoredDocumentReference): Promise<PdfInspectionResult>;
}

export const PDF_INSPECTOR = Symbol("PDF_INSPECTOR");
