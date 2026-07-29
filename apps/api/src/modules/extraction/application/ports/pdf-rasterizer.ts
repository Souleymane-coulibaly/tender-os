import type { StoredDocumentReference } from "./stored-document-reference";

export type RasterizedPage = Readonly<{ pageNumber: number; imageBuffer: Buffer; mimeType: string }>;

/**
 * Rasterisation PDF → image (mission Sprint 3 §9, nécessaire à l'OCR d'un PDF scanné : `OcrProvider`
 * n'accepte qu'une image, jamais un PDF). Port séparé de `PdfInspector`/`NativeTextExtractor` — une
 * seule responsabilité par port (mission §6 "ne crée pas une interface géante unique").
 */
export interface PdfRasterizer {
  rasterizePages(input: StoredDocumentReference & { pageNumbers: readonly number[] }): Promise<RasterizedPage[]>;
}

export const PDF_RASTERIZER = Symbol("PDF_RASTERIZER");
