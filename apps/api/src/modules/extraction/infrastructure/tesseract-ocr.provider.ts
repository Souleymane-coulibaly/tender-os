import { Inject, Injectable, Logger } from "@nestjs/common";
import { createWorker } from "tesseract.js";
import { ExtractionTimeoutError, ImageDimensionLimitExceededError, OcrProviderUnavailableError } from "../domain/extraction-errors";
import type { OcrInput, OcrProvider, OcrResult } from "../application/ports/ocr-provider";
import { EXTRACTION_CONFIG, type ExtractionConfig } from "./extraction-config";
import { readImageDimensions } from "./image-dimensions";

const PROVIDER_NAME = "tesseract.js";

/** ISO 639-1 (mission §9) → code Tesseract 3 lettres — jamais "fra" en dur : la sélection reste
 *  pilotée par `languageHints` (indication du Tender), avec repli explicite sur l'anglais si
 *  aucune indication exploitable n'est fournie (mission "ne mets pas systématiquement fr en
 *  dur"). */
const LANGUAGE_CODE_MAP: Readonly<Record<string, string>> = {
  fr: "fra",
  en: "eng",
  de: "deu",
  es: "spa",
  it: "ita",
  nl: "nld",
};
const DEFAULT_TESSERACT_LANGUAGE = "eng";

function mapLanguageHints(hints: readonly string[]): string {
  const mapped = hints.map((hint) => LANGUAGE_CODE_MAP[hint.toLowerCase()]).filter((code): code is string => !!code);
  const unique = [...new Set(mapped)];
  return unique.length > 0 ? unique.join("+") : DEFAULT_TESSERACT_LANGUAGE;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ExtractionTimeoutError({ timeoutMs })), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Unique adaptateur OCR de cette tranche (mission §9 "ne connecte pas plusieurs fournisseurs
 * pendant ce sprint") — moteur auto-hébergé (WASM, aucune clé/API distante requise), choisi car
 * aucun fournisseur cloud n'a de justificatif configuré dans cet environnement (voir audit
 * initial). Jamais de contenu OCR complet journalisé (mission §9 "sécurité") : seules des
 * métriques (durée, confiance, nombre de caractères) apparaissent dans les logs applicatifs, en
 * dehors de ce fichier.
 */
@Injectable()
export class TesseractOcrProvider implements OcrProvider {
  private readonly logger = new Logger(TesseractOcrProvider.name);

  constructor(@Inject(EXTRACTION_CONFIG) private readonly config: ExtractionConfig) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    if (input.imageBuffer.byteLength > this.config.ocrMaxFileSizeBytes) {
      throw new OcrProviderUnavailableError({
        reason: `image size (${input.imageBuffer.byteLength} bytes) exceeds OCR_MAX_FILE_SIZE_MB`,
      });
    }
    if (!this.config.ocrSupportedMimeTypes.includes(input.mimeType)) {
      throw new OcrProviderUnavailableError({ reason: `unsupported MIME type for OCR: ${input.mimeType}` });
    }
    // Correction P1-03 — dimensions lues depuis l'en-tête (jamais un décodage complet) : un
    // format non reconnu ou un en-tête malformé n'est jamais traité comme un dépassement, ce
    // contrôle reste additionnel au filet de sécurité déjà posé par la taille de fichier.
    const dimensions = readImageDimensions(input.imageBuffer);
    if (
      dimensions &&
      (dimensions.widthPx > this.config.extractionMaxImageDimensionPx ||
        dimensions.heightPx > this.config.extractionMaxImageDimensionPx)
    ) {
      throw new ImageDimensionLimitExceededError({
        widthPx: dimensions.widthPx,
        heightPx: dimensions.heightPx,
        maxDimensionPx: this.config.extractionMaxImageDimensionPx,
      });
    }

    const startedAt = Date.now();
    const langs = mapLanguageHints(input.languageHints);
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;

    try {
      worker = await withTimeout(createWorker(langs, 1, { logger: () => undefined }), this.config.ocrTimeoutMs);
      const { data } = await withTimeout(worker.recognize(input.imageBuffer), this.config.ocrTimeoutMs);

      const warnings: string[] = [];
      if (data.text.trim().length === 0) {
        warnings.push("OCR produced an empty result");
      }

      return {
        text: data.text,
        confidence: data.confidence,
        durationMs: Date.now() - startedAt,
        provider: PROVIDER_NAME,
        warnings,
      };
    } catch (error) {
      if (error instanceof ExtractionTimeoutError) {
        throw error;
      }
      // Jamais le message d'erreur fournisseur brut potentiellement verbeux dans un log
      // applicatif standard — seule une trace technique minimale, jamais le contenu de l'image.
      this.logger.error(`OCR failed after ${Date.now() - startedAt}ms`, error instanceof Error ? error.stack : undefined);
      throw new OcrProviderUnavailableError({
        reason: error instanceof Error ? error.message : "unknown OCR engine failure",
      });
    } finally {
      await worker?.terminate().catch(() => undefined);
    }
  }
}
