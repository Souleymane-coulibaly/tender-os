/**
 * Stratégie d'extraction retenue pour un `DceDocument` (mission Sprint 3 §5) — jamais décidée sur
 * la seule extension : `determineExtractionStrategy` (voir application/strategy) combine
 * extension, MIME déclaré et, pour les PDF, une inspection réelle du contenu
 * (`PdfInspector`) avant de trancher entre NATIVE_TEXT et OCR.
 *
 * Distincte de `DceDocumentCategory` (classification fonctionnelle RC/CCTP/BPU...) et de
 * `DceDocumentProcessingStatus` (éligibilité déterministe par extension, Sprint 2) : cette
 * tranche affine la décision une fois le contenu réellement inspecté.
 */
export const DocumentExtractionStrategy = {
  NativeText: "NATIVE_TEXT",
  Ocr: "OCR",
  OfficeDocument: "OFFICE_DOCUMENT",
  Spreadsheet: "SPREADSHEET",
  Unsupported: "UNSUPPORTED",
} as const;

export type DocumentExtractionStrategy =
  (typeof DocumentExtractionStrategy)[keyof typeof DocumentExtractionStrategy];

export function isDocumentExtractionStrategy(value: string): value is DocumentExtractionStrategy {
  return Object.values(DocumentExtractionStrategy).includes(value as DocumentExtractionStrategy);
}
