import { Inject, Injectable } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import { STORAGE_PROVIDER, type StorageProvider } from "../../documents";
import type { PdfRasterizer, RasterizedPage } from "../application/ports/pdf-rasterizer";
import type { StoredDocumentReference } from "../application/ports/stored-document-reference";
import { readStreamToBuffer } from "../../../shared-kernel/read-stream-to-buffer";

/**
 * Rasterisation PDF → PNG via `pdf-parse` (mission Sprint 3 §9) — nécessaire uniquement pour
 * l'OCR ciblé des pages estimées scannées (voir determineExtractionStrategy, "PDF mixte").
 * Échelle volontairement modeste (1.5) : un compromis lisibilité/temps de traitement documenté,
 * jamais une reconstruction haute fidélité.
 */
@Injectable()
export class PdfParseRasterizer implements PdfRasterizer {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider) {}

  async rasterizePages(
    input: StoredDocumentReference & { pageNumbers: readonly number[] },
  ): Promise<RasterizedPage[]> {
    if (input.pageNumbers.length === 0) {
      return [];
    }

    const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(input.storageKey));
    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getScreenshot({ partial: [...input.pageNumbers], scale: 1.5 });
      return result.pages.map((page) => ({
        pageNumber: page.pageNumber,
        imageBuffer: Buffer.from(page.data),
        mimeType: "image/png",
      }));
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }
}
