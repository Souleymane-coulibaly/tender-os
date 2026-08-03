import { Inject, Injectable } from "@nestjs/common";
import { InvalidPDFException, PasswordException, PDFParse } from "pdf-parse";
import { STORAGE_PROVIDER, type StorageProvider } from "../../documents";
import { CorruptedDocumentError, EncryptedPdfError } from "../domain/extraction-errors";
import type {
  NativeExtractionResult,
  NativeTextExtractor,
} from "../application/ports/native-text-extractor";
import type { StoredDocumentReference } from "../application/ports/stored-document-reference";
import { readStreamToBuffer } from "../../../shared-kernel/read-stream-to-buffer";

/**
 * Extraction de texte natif via `pdf-parse` (mission Sprint 3 §9) — jamais utilisé sur un PDF sans
 * texte embarqué (voir PdfInspector, appelé en amont par l'orchestrateur pour décider). Limite
 * documentée : restitue le texte dans l'ordre du flux de contenu PDF, jamais une reconstruction
 * de mise en page (colonnes, tableaux) — mission §9 "ne développe pas une reconstruction visuelle
 * complexe".
 */
@Injectable()
export class PdfParseNativeTextExtractor implements NativeTextExtractor {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider) {}

  async extract(input: StoredDocumentReference): Promise<NativeExtractionResult> {
    const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(input.storageKey));

    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ data: buffer });
      const info = await parser.getInfo();
      const textResult = await parser.getText();

      const warnings: string[] = [];
      const pages = textResult.pages.map((page) => {
        if (page.text.trim().length === 0) {
          warnings.push(`page ${page.num} has no extractable native text`);
        }
        return { pageNumber: page.num, text: page.text, characterCount: page.text.length };
      });

      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(info.info ?? {})) {
        if (typeof value === "string" && value.length > 0) {
          metadata[key] = value;
        }
      }

      return { pages, metadata, warnings };
    } catch (error) {
      if (error instanceof PasswordException) {
        throw new EncryptedPdfError();
      }
      if (error instanceof InvalidPDFException) {
        throw new CorruptedDocumentError({ reason: "the PDF structure could not be parsed" });
      }
      throw error;
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }
}
