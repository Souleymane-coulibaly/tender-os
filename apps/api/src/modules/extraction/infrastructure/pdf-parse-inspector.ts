import { Inject, Injectable } from "@nestjs/common";
import { InvalidPDFException, PasswordException, PDFParse } from "pdf-parse";
import { STORAGE_PROVIDER, type StorageProvider } from "../../documents";
import type { PdfInspectionResult, PdfInspector } from "../application/ports/pdf-inspector";
import type { StoredDocumentReference } from "../application/ports/stored-document-reference";
import { readStreamToBuffer } from "./read-stream-to-buffer";

/**
 * Inspection réelle du PDF (mission Sprint 3 §8) via `pdf-parse` — jamais une décision sur la
 * seule extension. Un PDF est considéré "scanné" par page lorsqu'aucun texte natif n'y est
 * détecté ; `encrypted`/`corrupted` sont dérivés des exceptions dédiées de `pdf-parse`
 * (`PasswordException`/`InvalidPDFException`), jamais d'une inspection de message d'erreur.
 */
@Injectable()
export class PdfParseInspector implements PdfInspector {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider) {}

  async inspect(input: StoredDocumentReference): Promise<PdfInspectionResult> {
    const stream = await this.storageProvider.openReadStream(input.storageKey);
    const buffer = await readStreamToBuffer(stream);

    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ data: buffer });
      const info = await parser.getInfo();
      const textResult = await parser.getText();

      const pagesWithText = textResult.pages.filter((page) => page.text.trim().length > 0).length;
      const pageCount = info.total;

      return {
        pageCount,
        hasEmbeddedText: pagesWithText > 0,
        estimatedScannedPageCount: Math.max(0, pageCount - pagesWithText),
        encrypted: false,
        corrupted: false,
      };
    } catch (error) {
      if (error instanceof PasswordException) {
        return { pageCount: 0, hasEmbeddedText: false, estimatedScannedPageCount: 0, encrypted: true, corrupted: false };
      }
      if (error instanceof InvalidPDFException) {
        return { pageCount: 0, hasEmbeddedText: false, estimatedScannedPageCount: 0, encrypted: false, corrupted: true };
      }
      throw error;
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }
}
