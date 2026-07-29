import type { DocumentExtractionStrategy } from "./document-extraction-strategy";

/**
 * Représentation intermédiaire commune à TOUTES les stratégies d'extraction (PDF natif, OCR,
 * DOCX, XLSX) — mission §12/§13 : normalisation et segmentation restent agnostiques du format
 * d'origine en opérant uniquement sur cette forme, jamais sur le résultat brut propre à chaque
 * adaptateur. `kind`/`index`/`label` portent la seule sémantique qui varie réellement :
 * - PDF/OCR   : kind="page",    index=numéro de page (1-based), label=undefined
 * - XLSX/XLS  : kind="sheet",   index=position de la feuille,   label=nom de la feuille
 * - DOCX      : kind="section", index=position,                 label=titre de section si détecté
 */
export type ExtractedContentUnitKind = "page" | "sheet" | "section";

export type ExtractedContentUnit = Readonly<{
  kind: ExtractedContentUnitKind;
  index: number;
  label?: string | undefined;
  text: string;
}>;

export type ExtractedContent = Readonly<{
  documentId: string;
  strategy: DocumentExtractionStrategy;
  units: readonly ExtractedContentUnit[];
  warnings: readonly string[];
}>;

/** Alias distinct au seul niveau des types : documente qu'un `ExtractedContent` est passé par
 *  `normalizeExtractedContent` avant d'atteindre la segmentation (mission §12→§13). */
export type NormalizedExtractedContent = ExtractedContent;
