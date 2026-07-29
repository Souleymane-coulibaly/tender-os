import { CorruptedDocumentError, EncryptedPdfError } from "../../domain/extraction-errors";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import type { PdfInspectionResult } from "../ports/pdf-inspector";
import type { StoredDocumentReference } from "../ports/stored-document-reference";

const OCR_ELIGIBLE_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const OFFICE_DOCUMENT_EXTENSIONS = new Set(["docx"]);
const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls"]);

export type ExtractionStrategyDecision = Readonly<{
  strategy: DocumentExtractionStrategy;
  reason: string;
  /** Mission Sprint 3 §7 "PDF mixte" — pages dont l'extraction native est attendue vide/quasi
   *  vide et qui méritent un OCR ciblé en complément, jamais un signal utilisé pour les autres
   *  stratégies. */
  targetedOcrPageNumbers?: readonly number[] | undefined;
}>;

/**
 * Détection de stratégie (mission Sprint 3 §7) — jamais sur la seule extension : un PDF est
 * toujours tranché à partir d'une inspection réelle de son contenu (`PdfInspectionResult`,
 * fournie par l'appelant après un premier passage par `PdfInspector`). Les autres formats
 * n'ont pas besoin d'inspection : leur stratégie est déterminée par extension, cohérent avec le
 * choix déjà fait pour `DceDocumentProcessingStatus` (Sprint 2).
 */
export function determineExtractionStrategy(
  reference: StoredDocumentReference,
  pdfInspection?: PdfInspectionResult,
): ExtractionStrategyDecision {
  const extension = reference.extension.toLowerCase().replace(/^\./, "");

  if (extension === "pdf") {
    if (!pdfInspection) {
      throw new Error("A PDF requires a PdfInspectionResult before its extraction strategy can be decided.");
    }
    if (pdfInspection.corrupted) {
      throw new CorruptedDocumentError({ reason: "the PDF structure could not be parsed" });
    }
    if (pdfInspection.encrypted) {
      throw new EncryptedPdfError();
    }
    if (!pdfInspection.hasEmbeddedText) {
      return { strategy: DocumentExtractionStrategy.Ocr, reason: "no embedded text detected (scanned PDF)" };
    }
    if (pdfInspection.estimatedScannedPageCount > 0) {
      // PDF mixte : texte natif comme stratégie principale, complété par un OCR ciblé des seules
      // pages estimées scannées (mission §7) — jamais un OCR systématique de tout le document.
      return {
        strategy: DocumentExtractionStrategy.NativeText,
        reason: `mixed PDF: native text for most pages, targeted OCR for ${pdfInspection.estimatedScannedPageCount} estimated scanned page(s)`,
      };
    }
    return { strategy: DocumentExtractionStrategy.NativeText, reason: "embedded text detected on every page" };
  }

  if (OCR_ELIGIBLE_EXTENSIONS.has(extension)) {
    return { strategy: DocumentExtractionStrategy.Ocr, reason: "image format" };
  }
  if (OFFICE_DOCUMENT_EXTENSIONS.has(extension)) {
    return { strategy: DocumentExtractionStrategy.OfficeDocument, reason: "office document format" };
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return { strategy: DocumentExtractionStrategy.Spreadsheet, reason: "spreadsheet format" };
  }
  return { strategy: DocumentExtractionStrategy.Unsupported, reason: `"${extension}" has no supported extractor` };
}
